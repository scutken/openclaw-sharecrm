/**
 * ShareCRM IM Gateway 的客户端
 *
 * 架构：SSE 下行 + REST API 上行
 * - SSE: 接收服务端推送的消息（connected, ping, message, error）
 * - REST API: 发送消息到服务端
 */

import https from "https";
import http from "http";
import type {
  ShareCrmSseEvent,
  ResolvedShareCrmAccount,
  AuthTokenResponse,
  SendMessageResponse,
} from "./types.js";

const RECONNECT_DELAY_MS = 3000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 提前 5 分钟刷新 Token

export type ShareCrmClientOptions = {
  account: ResolvedShareCrmAccount;
  onConnected: (botId: string) => void;
  onMessage: (data: ShareCrmSseEvent & { type: "message" }) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
  log?: (...args: any[]) => void;
};

export class ShareCrmClient {
  private request: http.ClientRequest | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private options: ShareCrmClientOptions;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _connecting = false;

  constructor(options: ShareCrmClientOptions) {
    this.options = options;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** 获取 AccessToken */
  private async fetchAccessToken(): Promise<string> {
    const { gatewayBaseUrl, appId, appSecret } = this.options.account;

    const response = await fetch(`${gatewayBaseUrl}/im-gateway/auth/token`, {
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
      const urlStr = `${gatewayBaseUrl}/im-gateway/bot/events?token=${token}`;
      const url = new URL(urlStr);

      log(`sharecrm: 正在连接 SSE ${urlStr.replace(/\?token=.+$/, "?token=***")}`);

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
          buffer = this.parseSSEBuffer(buffer, (event, data) => {
            this.handleParsedEvent(event, data);
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

      this.request.setTimeout(60000); // 60秒超时（服务端 ping 间隔 30s，留 2x 余量）
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
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
  }

  /** 解析 SSE 事件流，返回未处理的剩余 buffer */
  private parseSSEBuffer(buffer: string, callback: (event: string, data: string) => void): string {
    const blocks = buffer.split("\n\n");
    const remaining = blocks.pop() ?? ""; // 最后一块可能不完整
    for (const block of blocks) {
      if (!block.trim()) continue;

      let eventName = "message";
      const dataLines: string[] = [];

      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length > 0) {
        callback(eventName, dataLines.join("\n"));
      }
    }
    return remaining;
  }

  /** 处理解析后的事件 */
  private handleParsedEvent(eventName: string, data: string): void {
    const log = this.options.log ?? console.log;

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
        log(`sharecrm: 已认证为 ${msg.data.bot_id}`);
        this.options.onConnected(msg.data.bot_id);
        break;

      case "message":
        this.options.onMessage(msg as ShareCrmSseEvent & { type: "message" });
        break;

      case "error":
        log(`sharecrm: 错误 [${msg.error.code}]: ${msg.error.message}`);
        this.options.onError?.(new Error(`[${msg.error.code}] ${msg.error.message}`));
        break;

      case "ping":
        console.debug("sharecrm: 收到心跳 ping");
        break;
    }
  }

  /** 通过 REST API 发送消息到指定会话 */
  async sendMessage(chatId: string, text: string): Promise<{ messageId: string; chatId: string } | null> {
    try {
      const token = await this.ensureToken();
      const { gatewayBaseUrl } = this.options.account;

      const response = await fetch(`${gatewayBaseUrl}/im-gateway/qixin/message/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      });

      const data: SendMessageResponse = await response.json();

      if (data.code === 0 && data.data?.message_id) {
        return { messageId: data.data.message_id, chatId };
      }

      const log = this.options.log ?? console.log;
      log(`sharecrm: 发送消息失败: ${data.msg || "未知错误"}`);
      return null;
    } catch (err) {
      const log = this.options.log ?? console.log;
      log(`sharecrm: 发送消息异常: ${String(err)}`);
      return null;
    }
  }

  /** 安排重连尝试 */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) return;

    const log = this.options.log ?? console.log;
    log(`sharecrm: ${RECONNECT_DELAY_MS}ms 后重连...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, RECONNECT_DELAY_MS);
  }

  /** 断开连接并停止重连 */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupRequest();
    this._connected = false;
  }
}
