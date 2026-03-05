/**
 * ShareCRM IM Gateway 的客户端
 *
 * 架构：SSE 下行 + REST API 上行
 * - SSE: 接收服务端推送的消息（connected, ping, message, error）
 * - REST API: 发送消息到服务端
 */

import { EventSource, type ErrorEvent } from "eventsource";
import type {
  ShareCrmServerMessage,
  ShareCrmSseEvent,
  ResolvedShareCrmAccount,
  AuthTokenResponse,
  SendMessageResponse,
} from "./types.js";

const RECONNECT_DELAY_MS = 3000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 提前 5 分钟刷新 Token
const SSE_RETRY_DELAY_MS = 3000; // SSE 重连延迟

export type ShareCrmClientOptions = {
  account: ResolvedShareCrmAccount;
  onConnected: (botId: string) => void;
  onMessage: (data: ShareCrmServerMessage & { type: "message" }) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
  log?: (...args: any[]) => void;
};

export class ShareCrmClient {
  private eventSource: EventSource | null = null;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private options: ShareCrmClientOptions;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

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
    // 提前 5 分钟刷新
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

  /** 构建 SSE URL */
  private async buildSseUrl(): Promise<string> {
    const token = await this.ensureToken();
    const { gatewayBaseUrl } = this.options.account;
    return `${gatewayBaseUrl}/im-gateway/bot/events?token=${token}`;
  }

  /** 连接到 Gateway */
  async connect(): Promise<void> {
    if (this.eventSource) {
      return;
    }

    const log = this.options.log ?? console.log;

    try {
      const url = await this.buildSseUrl();
      log(`sharecrm: 正在连接 SSE ${url.replace(/\?token=.+$/, "?token=***")}`);

      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        log("sharecrm: SSE 连接已建立");
      };

      this.eventSource.onmessage = (event: MessageEvent) => {
        // 处理未命名的事件（通常不会用到）
        log(`sharecrm: 收到未命名 SSE 事件: ${event.data}`);
      };

      this.eventSource.onerror = (error: ErrorEvent) => {
        const state = this.eventSource?.readyState;
        // EventSource 会自动尝试重连，但我们手动控制重连逻辑
        if (state === EventSource.CLOSED) {
          this._connected = false;
          log("sharecrm: SSE 连接已关闭");
          this.eventSource?.close();
          this.eventSource = null;
          this.options.onDisconnected("SSE connection closed");
          this.scheduleReconnect();
        } else if (state === EventSource.CONNECTING) {
          log("sharecrm: SSE 正在重连...");
        }
      };

      // 监听特定事件
      this.eventSource.addEventListener("connected", (event: MessageEvent) => {
        try {
          const msg: ShareCrmSseEvent = JSON.parse(event.data);
          this.handleSseEvent(msg);
        } catch (err) {
          log(`sharecrm: connected 事件解析失败: ${String(err)}`);
        }
      });

      this.eventSource.addEventListener("ping", (_event: MessageEvent) => {
        // 心跳事件，无需处理，只记录日志
        log("sharecrm: 收到心跳 ping");
      });

      this.eventSource.addEventListener("message", (event: MessageEvent) => {
        try {
          const msg: ShareCrmSseEvent = JSON.parse(event.data);
          this.handleSseEvent(msg);
        } catch (err) {
          log(`sharecrm: message 事件解析失败: ${String(err)}`);
        }
      });

      this.eventSource.addEventListener("error", (event: MessageEvent) => {
        try {
          const msg: ShareCrmSseEvent = JSON.parse(event.data);
          this.handleSseEvent(msg);
        } catch (err) {
          log(`sharecrm: error 事件解析失败: ${String(err)}`);
        }
      });

    } catch (err) {
      log(`sharecrm: 连接失败: ${String(err)}`);
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
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
        // 心跳事件，忽略
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._connected = false;
  }
}
