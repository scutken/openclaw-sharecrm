/**
 * ShareCRM IM Gateway 的客户端
 *
 * 架构：SSE 下行 + REST API 上行
 * - SSE: 接收服务端推送的消息（connected, message, reset, error）
 * - REST API: 发送消息到服务端
 */

import https from "https";
import http from "http";
import type {
  ShareCrmSseEvent,
  ResolvedShareCrmAccount,
  AuthTokenResponse,
  SendMessageRequest,
  SendMessageResponse,
} from "./types.js";
import { redactLogArgs, redactSensitive, redactUrl } from "./log.js";

const DEFAULT_RECONNECT_DELAY_MS = 1000;
const IMMEDIATE_RECONNECT_DELAY_MS = 50;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 提前 5 分钟刷新 Token
const MAX_LIFETIME_RECONNECT_BUFFER_MS = 5 * 1000;
const SEND_RETRY_BASE_DELAY_MS = 1000;
const SEND_RETRY_JITTER_RATIO = 0.2;
const SEND_RETRY_MAX_ATTEMPTS = 2;
const SEND_RECONNECT_WAIT_TIMEOUT_MS = 10_000;
const SEND_RECONNECT_POLL_MS = 250;
export const SHARECRM_GATEWAY_PROTOCOL_VERSION = "1.4.0";

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeRetryDelayMs(baseMs = SEND_RETRY_BASE_DELAY_MS, random = Math.random): number {
  const jitter = 1 + random() * SEND_RETRY_JITTER_RATIO;
  return Math.max(0, Math.round(baseMs * jitter));
}

export function buildSseUrl(gatewayBaseUrl: string, token: string, version = SHARECRM_GATEWAY_PROTOCOL_VERSION): URL {
  const url = new URL(gatewayBaseUrl.endsWith("/") ? gatewayBaseUrl : `${gatewayBaseUrl}/`);
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/im-gateway/bot/events`.replace(/\/+/g, "/");
  url.searchParams.set("token", token);
  url.searchParams.set("version", version);
  return url;
}

export function buildSendMessagePayload(
  chatId: string,
  text: string,
  options?: { replyMessageId?: string | number },
): SendMessageRequest {
  const payload: SendMessageRequest = {
    chat_id: chatId,
    text,
  };

  if (options?.replyMessageId != null && options.replyMessageId !== "") {
    payload.reply_message_id = options.replyMessageId;
  }

  return payload;
}

/**
 * 使用 Node.js 原生 https 模块发送 HTTP 请求（作为 fetch 的 fallback）
 */
function httpsRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): Promise<{ status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const httpModule = parsedUrl.protocol === "https:" ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: options.headers,
      timeout: 15000,
    };

    const req = httpModule.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          json: async () => {
            const trimmed = data.trim();
            if (!trimmed) return {};
            try {
              return JSON.parse(trimmed);
            } catch {
              throw new Error(`ShareCRM: expected JSON response, got: ${trimmed.slice(0, 200)}`);
            }
          },
        });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("httpsRequest timeout"));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * 带 fetch→https fallback 的 HTTP 请求
 * 自动记录参数、耗时、返回值
 */
function parseJsonBody(body?: string): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

async function readResponseJson(response: { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    if (typeof response.clone === "function") {
      return await response.clone().json();
    }
    if (typeof response.json === "function") {
      return await response.json();
    }
  } catch {
    return null;
  }
  return null;
}

async function requestWithFallback(
  log: (...args: any[]) => void,
  label: string,
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
  fetchImpl?: typeof fetch,
): Promise<{ status: number; json: () => Promise<any> }> {
  const safeLog = (...args: unknown[]) => log(...redactLogArgs(args));
  const params = {
    method: options.method,
    url: redactUrl(url),
    body: redactSensitive(parseJsonBody(options.body)),
  };
  const start = Date.now();

  try {
    const response = await (fetchImpl ?? fetch)(url, options);
    const duration = Date.now() - start;
    const data = await readResponseJson(response as { json?: () => Promise<unknown>; clone?: () => { json: () => Promise<unknown> } });
    safeLog(`sharecrm: ${label} OK (fetch)`, { params, durationMs: duration, status: (response as { status?: number }).status, data: redactSensitive(data) });
    if (typeof (response as { json?: unknown }).json !== "function") {
      return {
        status: (response as { status?: number }).status ?? 0,
        json: async () => data,
      } as any;
    }
    if (data !== null && typeof (response as { json?: unknown }).json === "function") {
      return {
        status: (response as { status?: number }).status ?? 0,
        json: async () => data,
      } as any;
    }
    return response as any;
  } catch (fetchErr) {
    const duration = Date.now() - start;
    safeLog(`sharecrm: ${label} fetch failed (${duration}ms), falling back to https: ${String(fetchErr)}`);
  }

  try {
    const response = await httpsRequest(url, options);
    const duration = Date.now() - start;
    const data = await response.json();
    safeLog(`sharecrm: ${label} OK (https fallback)`, { params, durationMs: duration, status: response.status, data: redactSensitive(data) });
    return {
      status: response.status,
      json: () => Promise.resolve(data),
    } as any;
  } catch (httpsErr) {
    const duration = Date.now() - start;
    safeLog(`sharecrm: ${label} https fallback also failed`, { params, durationMs: duration, error: String(httpsErr) });
    throw httpsErr;
  }
}

export type ShareCrmClientOptions = {
  account: ResolvedShareCrmAccount;
  onConnected: (info: { botFullId: string; protocolVersion?: string; clientVersion?: string; maxLifetime?: number }) => void;
  onMessage: (data: ShareCrmSseEvent & { type: "message" }) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
  onLastEventId?: (lastEventId: string | null) => void;
  lastEventId?: string | null;
  log?: (...args: any[]) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export class ShareCrmClient {
  private request: http.ClientRequest | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private options: ShareCrmClientOptions;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private maxLifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
  private lastEventId: string | null = null;
  private reconnectAttempt = 0;
  private _connected = false;
  private _connecting = false;

  constructor(options: ShareCrmClientOptions) {
    this.options = options;
    this.lastEventId = options.lastEventId?.trim() || null;
  }

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  private get sleepImpl(): (ms: number) => Promise<void> {
    return this.options.sleep ?? defaultSleep;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** 获取 AccessToken */
  private async fetchAccessToken(): Promise<string> {
    const log = this.options.log ?? console.log;
    const { gatewayBaseUrl, appId, appSecret } = this.options.account;
    const url = `${gatewayBaseUrl}/im-gateway/auth/token`;

    const response = await requestWithFallback(log, "fetchToken", url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, appSecret }),
    }, this.fetchImpl);

    const data: AuthTokenResponse = await response.json();

    if (data.code !== 0 || !data.data) {
      throw new Error(data.msg || "failed to fetch ShareCRM token");
    }

    this.accessToken = data.data.accessToken;
    this.tokenExpiresAt = Date.now() + data.data.expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS;

    return this.accessToken;
  }

  private invalidateToken(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  /** 确保 Token 有效 */
  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    return this.fetchAccessToken();
  }

  /** 连接到 Gateway (使用原生 https 模块) */
  async connect(): Promise<void> {
    if (this.request || this._connecting) {
      return;
    }
    this._connecting = true;

    const log = this.options.log ?? console.log;

    try {
      const token = await this.ensureToken();
      const { gatewayBaseUrl } = this.options.account;
      const url = buildSseUrl(gatewayBaseUrl, token);

      log(`sharecrm: connecting SSE ${redactUrl(url.toString())}`);

      const httpModule = url.protocol === "https:" ? https : http;

      const reqOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          "Accept": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Authorization": `Bearer ${token}`,
        },
      };

      if (this.lastEventId) {
        reqOptions.headers = {
          ...reqOptions.headers,
          "Last-Event-ID": this.lastEventId,
        };
      }

      this.request = httpModule.request(reqOptions, (res) => {
        this._connecting = false;

        if (res.statusCode !== 200) {
          log(`sharecrm: SSE connect failed, statusCode=${res.statusCode}`);
          this.cleanupRequest();
          this.scheduleReconnect();
          return;
        }

        log(`sharecrm: SSE connected, statusCode=${res.statusCode}`);

        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          buffer = this.parseSSEBuffer(buffer, ({ event, data, id, retry }) => {
            this.handleParsedEvent(event, data, { id, retry });
          });
        });

        res.on("end", () => {
          log("sharecrm: SSE connection closed");
          const wasConnected = this._connected;
          this._connected = false;
          this.cleanupRequest();
          if (wasConnected) {
            this.options.onDisconnected("SSE connection closed");
          }
          this.scheduleReconnect();
        });

        res.on("error", (err) => {
          log(`sharecrm: SSE response error: ${err.message}`);
          const wasConnected = this._connected;
          this._connected = false;
          this.cleanupRequest();
          if (wasConnected) {
            this.options.onDisconnected("SSE response error");
          }
          this.scheduleReconnect();
        });
      });

      this.request.on("error", (err) => {
        this._connecting = false;
        log(`sharecrm: SSE request error: ${err.message}`);
        this.cleanupRequest();
        this.options.onError?.(err);
        this.scheduleReconnect();
      });

      this.request.on("timeout", () => {
        this._connecting = false;
        log("sharecrm: SSE request timeout");
        this.cleanupRequest();
        this.scheduleReconnect();
      });

      this.request.setTimeout(0);
      this.request.end();

    } catch (err) {
      this._connecting = false;
      log(`sharecrm: connect failed: ${String(err)}`);
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  /** 清理请求 */
  private cleanupRequest(): void {
    this.clearMaxLifetimeTimer();
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
  }

  /** 解析 SSE 事件流，返回未处理的剩余 buffer */
  private parseSSEBuffer(
    buffer: string,
    callback: (event: { event: string; data: string; id?: string; retry?: number }) => void,
  ): string {
    const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
    const remaining = blocks.pop() ?? ""; // 最后一块可能不完整
    for (const block of blocks) {
      if (!block.trim()) continue;

      let eventName = "message";
      const dataLines: string[] = [];
      let id: string | undefined;
      let retry: number | undefined;

      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) {
          continue;
        }
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        } else if (line.startsWith("id:")) {
          id = line.slice(3).trim();
        } else if (line.startsWith("retry:")) {
          const nextDelay = Number.parseInt(line.slice(6).trim(), 10);
          if (Number.isFinite(nextDelay) && nextDelay >= 0) {
            retry = nextDelay;
          }
        }
      }

      if (dataLines.length > 0) {
        callback({ event: eventName, data: dataLines.join("\n"), id, retry });
      }
    }
    return remaining;
  }

  /** 处理解析后的事件 */
  private handleParsedEvent(eventName: string, data: string, meta?: { id?: string; retry?: number }): void {
    const log = this.options.log ?? console.log;

    if (meta?.retry != null) {
      this.reconnectDelayMs = Math.max(0, meta.retry);
    }

    if (meta?.id) {
      this.lastEventId = meta.id;
      this.options.onLastEventId?.(meta.id);
    }

    try {
      const msg: ShareCrmSseEvent = JSON.parse(data);
      this.handleSseEvent(msg);
    } catch (err) {
      log(`sharecrm: failed to parse ${eventName} event: ${String(err)}`);
    }
  }

  /** 处理 SSE 事件 */
  private handleSseEvent(msg: ShareCrmSseEvent): void {
    const log = this.options.log ?? console.log;

    switch (msg.type) {
      case "connected":
        this._connected = true;
        this.reconnectAttempt = 0;
        log(`sharecrm: connected bot ${msg.data.bot_full_id}`);
        this.refreshMaxLifetimeTimer(msg.data.max_lifetime);
        if (msg.data.retry != null && msg.data.retry >= 0) {
          this.reconnectDelayMs = msg.data.retry;
        }
        this.options.onConnected({
          botFullId: msg.data.bot_full_id,
          protocolVersion: msg.data.protocol_version,
          clientVersion: msg.data.client_version,
          maxLifetime: msg.data.max_lifetime,
        });
        break;

      case "message":
        this.options.onMessage(msg as ShareCrmSseEvent & { type: "message" });
        break;

      case "error":
        log(`sharecrm: error [${msg.error.code}]: ${msg.error.message}`);
        this.options.onError?.(new Error(`[${msg.error.code}] ${msg.error.message}`));
        break;

      case "reset":
        log(`sharecrm: server reset event cursor: ${msg.reason}`);
        log("sharecrm: unable to resume missed events; reconnecting immediately");
        this.lastEventId = null;
        this.options.onLastEventId?.(null);
        this.cleanupRequest();
        this._connected = false;
        this.options.onDisconnected(`SSE reset: ${msg.reason}`);
        this.scheduleReconnect(IMMEDIATE_RECONNECT_DELAY_MS);
        break;
    }
  }

  private clearMaxLifetimeTimer(): void {
    if (this.maxLifetimeTimer) {
      clearTimeout(this.maxLifetimeTimer);
      this.maxLifetimeTimer = null;
    }
  }

  private refreshMaxLifetimeTimer(maxLifetime?: number): void {
    this.clearMaxLifetimeTimer();
    if (!maxLifetime || maxLifetime <= 0) {
      return;
    }

    const reconnectInMs = Math.max(1000, maxLifetime - MAX_LIFETIME_RECONNECT_BUFFER_MS);
    const log = this.options.log ?? console.log;

    this.maxLifetimeTimer = setTimeout(async () => {
      this.maxLifetimeTimer = null;
      log(`sharecrm: SSE connection approaching max lifetime, reconnecting`);
      this._connected = false;
      // 先刷新 Token 再断开旧连接，避免新连接使用过期 Token
      try {
        await this.fetchAccessToken();
      } catch (err) {
        log(`sharecrm: failed to refresh token before maxLifetime reconnect: ${String(err)}`);
      }
      this.reconnectAttempt = 0;
      this.cleanupRequest();
      this.scheduleReconnect(IMMEDIATE_RECONNECT_DELAY_MS);
    }, reconnectInMs);
  }

  private async waitForConnectionRecovery(timeoutMs = SEND_RECONNECT_WAIT_TIMEOUT_MS): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.connected) {
        return true;
      }
      await this.sleepImpl(SEND_RECONNECT_POLL_MS);
    }
    return this.connected;
  }

  /** 通过 REST API 发送消息到指定会话 */
  async sendMessage(
    chatId: string,
    text: string,
    options?: { replyMessageId?: string | number },
  ): Promise<{ messageId: string; chatId: string }> {
    const log = this.options.log ?? console.log;
    const payload = buildSendMessagePayload(chatId, text, options);

    for (let attempt = 1; attempt <= SEND_RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const token = await this.ensureToken();
        const { gatewayBaseUrl } = this.options.account;
        const url = `${gatewayBaseUrl}/im-gateway/qixin/message/send`;

        const response = await requestWithFallback(log, `sendMessage(chatId=${chatId}, attempt=${attempt})`, url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }, this.fetchImpl);

        const data: SendMessageResponse = await response.json();

        if (data.code === 0 && data.data?.message_id) {
          return { messageId: data.data.message_id, chatId };
        }

        if (attempt < SEND_RETRY_MAX_ATTEMPTS) {
          if (data.code === 40100 || data.code === 40101) {
            log(`sharecrm: send returned ${data.code}, refreshing token and retrying once`);
            this.invalidateToken();
            await this.fetchAccessToken();
            continue;
          }

          if (data.code === 50001) {
            log(`sharecrm: bot is offline, waiting for SSE recovery before retry`);
            const recovered = await this.waitForConnectionRecovery();
            if (recovered) {
              continue;
            }
            log(`sharecrm: SSE did not recover in retry window, skipping send retry`);
          }

          if (data.code === 50000) {
            const delayMs = computeRetryDelayMs();
            log(`sharecrm: send returned 50000, retrying in ${delayMs}ms`);
            await this.sleepImpl(delayMs);
            continue;
          }
        }

        throw new Error(data.msg || `ShareCRM send failed with code ${data.code ?? "unknown"}`);
      } catch (err) {
        if (attempt < SEND_RETRY_MAX_ATTEMPTS) {
          const delayMs = computeRetryDelayMs();
          log(`sharecrm: send exception, retrying in ${delayMs}ms: ${String(err)}`);
          await this.sleepImpl(delayMs);
          continue;
        }

        throw err instanceof Error ? err : new Error(String(err));
      }
    }

    throw new Error("ShareCRM: failed to send message");
  }

  /** 安排重连尝试 */
  private scheduleReconnect(delayMs = this.reconnectDelayMs): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    const log = this.options.log ?? console.log;
    // 指数退避：连续重连失败时逐步增加延迟，上限 30s
    const backoffMs = Math.min(delayMs * Math.pow(2, this.reconnectAttempt), 30_000);
    const label = backoffMs !== delayMs ? ` (backoff ${backoffMs}ms)` : "";
    log(`sharecrm: reconnecting in ${backoffMs}ms${label}...`);

    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, backoffMs);
  }

  /** 断开连接并停止重连 */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearMaxLifetimeTimer();
    this.cleanupRequest();
    this._connected = false;
  }
}
