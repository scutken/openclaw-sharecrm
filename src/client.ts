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

const DEFAULT_RECONNECT_DELAY_MS = 1000;
const IMMEDIATE_RECONNECT_DELAY_MS = 50;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 提前 5 分钟刷新 Token
const MAX_LIFETIME_RECONNECT_BUFFER_MS = 5 * 1000;
const SEND_RETRY_BASE_DELAY_MS = 1000;
const SEND_RETRY_JITTER_RATIO = 0.2;
const SEND_RETRY_MAX_ATTEMPTS = 2;
const SEND_RECONNECT_WAIT_TIMEOUT_MS = 10_000;
const SEND_RECONNECT_POLL_MS = 250;
export const SHARECRM_GATEWAY_PROTOCOL_VERSION = "1.2.0";

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

export type ShareCrmClientOptions = {
  account: ResolvedShareCrmAccount;
  onConnected: (info: { botFullId: string; protocolVersion?: string; clientVersion?: string; maxLifetime?: number }) => void;
  onMessage: (data: ShareCrmSseEvent & { type: "message" }) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
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
  private _connected = false;
  private _connecting = false;

  constructor(options: ShareCrmClientOptions) {
    this.options = options;
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
    const { gatewayBaseUrl, appId, appSecret } = this.options.account;

    const response = await this.fetchImpl(`${gatewayBaseUrl}/im-gateway/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, appSecret }),
    });

    const data: AuthTokenResponse = await response.json();

    if (data.code !== 0 || !data.data) {
      throw new Error(data.msg || "获取 Token 失败");
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

      log(`sharecrm: 正在连接 SSE ${url.toString().replace(/token=[^&]+/, "token=***")}`);

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
          log(`sharecrm: SSE 连接失败, statusCode=${res.statusCode}`);
          this.cleanupRequest();
          this.scheduleReconnect();
          return;
        }

        log(`sharecrm: SSE 连接已建立, statusCode=${res.statusCode}`);

        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          buffer = this.parseSSEBuffer(buffer, ({ event, data, id, retry }) => {
            this.handleParsedEvent(event, data, { id, retry });
          });
        });

        res.on("end", () => {
          log("sharecrm: SSE 连接已关闭");
          const wasConnected = this._connected;
          this._connected = false;
          this.cleanupRequest();
          if (wasConnected) {
            this.options.onDisconnected("SSE connection closed");
          }
          this.scheduleReconnect();
        });

        res.on("error", (err) => {
          log(`sharecrm: SSE 响应错误: ${err.message}`);
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
        log(`sharecrm: SSE 请求错误: ${err.message}`);
        this.cleanupRequest();
        this.options.onError?.(err);
        this.scheduleReconnect();
      });

      this.request.on("timeout", () => {
        this._connecting = false;
        log("sharecrm: SSE 请求超时");
        this.cleanupRequest();
        this.scheduleReconnect();
      });

      this.request.setTimeout(0);
      this.request.end();

    } catch (err) {
      this._connecting = false;
      log(`sharecrm: 连接失败: ${String(err)}`);
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
    }

    try {
      const msg: ShareCrmSseEvent = JSON.parse(data);
      this.handleSseEvent(msg);
    } catch (err) {
      log(`sharecrm: ${eventName} 事件解析失败: ${String(err)}, data=${data}`);
    }
  }

  /** 处理 SSE 事件 */
  private handleSseEvent(msg: ShareCrmSseEvent): void {
    const log = this.options.log ?? console.log;

    switch (msg.type) {
      case "connected":
        this._connected = true;
        log(`sharecrm: 已连接企信 Bot ${msg.data.bot_full_id}`);
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
        log(`sharecrm: 错误 [${msg.error.code}]: ${msg.error.message}`);
        this.options.onError?.(new Error(`[${msg.error.code}] ${msg.error.message}`));
        break;

      case "reset":
        log(`sharecrm: 服务端要求重置事件游标: ${msg.reason}`);
        log("sharecrm: 无法恢复断线期间的历史消息，将立即重连；此前消息可能未被接收");
        this.lastEventId = null;
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

    this.maxLifetimeTimer = setTimeout(() => {
      this.maxLifetimeTimer = null;
      log(`sharecrm: SSE 连接即将达到最大生命周期，主动重连`);
      this.cleanupRequest();
      this._connected = false;
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
  ): Promise<{ messageId: string; chatId: string } | null> {
    const log = this.options.log ?? console.log;
    const payload = buildSendMessagePayload(chatId, text, options);

    for (let attempt = 1; attempt <= SEND_RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const token = await this.ensureToken();
        const { gatewayBaseUrl } = this.options.account;

        const response = await this.fetchImpl(`${gatewayBaseUrl}/im-gateway/qixin/message/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data: SendMessageResponse = await response.json();

        if (data.code === 0 && data.data?.message_id) {
          return { messageId: data.data.message_id, chatId };
        }

        if (attempt < SEND_RETRY_MAX_ATTEMPTS) {
          if (data.code === 40100 || data.code === 40101) {
            log(`sharecrm: 发送消息返回 ${data.code}，刷新 Token 后重试一次`);
            this.invalidateToken();
            await this.fetchAccessToken();
            continue;
          }

          if (data.code === 50001) {
            log(`sharecrm: Bot 当前未在线，等待 SSE 恢复后重试一次`);
            const recovered = await this.waitForConnectionRecovery();
            if (recovered) {
              continue;
            }
            log(`sharecrm: SSE 未在重试窗口内恢复，取消发送重试`);
          }

          if (data.code === 50000) {
            const delayMs = computeRetryDelayMs();
            log(`sharecrm: 发送消息返回 50000，${delayMs}ms 后重试一次`);
            await this.sleepImpl(delayMs);
            continue;
          }
        }

        log(`sharecrm: 发送消息失败: ${data.msg || "未知错误"}`);
        return null;
      } catch (err) {
        if (attempt < SEND_RETRY_MAX_ATTEMPTS) {
          const delayMs = computeRetryDelayMs();
          log(`sharecrm: 发送消息异常，将在 ${delayMs}ms 后重试一次: ${String(err)}`);
          await this.sleepImpl(delayMs);
          continue;
        }

        log(`sharecrm: 发送消息异常: ${String(err)}`);
        return null;
      }
    }

    return null;
  }

  /** 安排重连尝试 */
  private scheduleReconnect(delayMs = this.reconnectDelayMs): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    const log = this.options.log ?? console.log;
    log(`sharecrm: ${delayMs}ms 后重连...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delayMs);
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
