/**
 * ShareCRM IM Gateway 的客户端
 *
 * 架构：WebSocket 下行 + REST API 上行
 * - WebSocket: 接收服务端推送的消息（connected, message, error）
 * - REST API: 发送消息到服务端
 */

import WebSocket from "ws";
import type {
  ShareCrmServerMessage,
  ResolvedShareCrmAccount,
  AuthTokenResponse,
  SendMessageResponse,
} from "./types.js";

const RECONNECT_DELAY_MS = 3000;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 提前 5 分钟刷新 Token

export type ShareCrmClientOptions = {
  account: ResolvedShareCrmAccount;
  onConnected: (botId: string) => void;
  onMessage: (data: ShareCrmServerMessage & { type: "message" }) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
  log?: (...args: any[]) => void;
};

export class ShareCrmClient {
  private ws: WebSocket | null = null;
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
    const { apiBaseUrl, appId, appSecret } = this.options.account;

    const response = await fetch(`${apiBaseUrl}/im-gateway/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, appSecret }),
    });

    const data: AuthTokenResponse = await response.json();

    if (data.code !== 0 || !data.data) {
      throw new Error(data.message || "获取 Token 失败");
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

  /** 构建 WebSocket URL */
  private async buildUrl(): Promise<string> {
    const token = await this.ensureToken();
    const { gatewayUrl } = this.options.account;
    return `${gatewayUrl}/im-gateway/bot?token=${token}`;
  }

  /** 连接到 Gateway */
  async connect(): Promise<void> {
    if (this.ws) {
      return;
    }

    const log = this.options.log ?? console.log;

    try {
      const url = await this.buildUrl();
      log(`sharecrm: 正在连接 ${url.replace(/\?token=.+$/, "?token=***")}`);

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        log("sharecrm: WebSocket 连接已建立");
      });

      this.ws.on("message", (raw) => {
        try {
          const msg: ShareCrmServerMessage = JSON.parse(raw.toString());
          this.handleMessage(msg);
        } catch (err) {
          log(`sharecrm: 消息解析失败: ${String(err)}`);
        }
      });

      this.ws.on("close", (code, reason) => {
        this._connected = false;
        const reasonStr = reason?.toString() || `code: ${code}`;
        log(`sharecrm: WebSocket 已关闭: ${reasonStr}`);
        this.ws = null;
        this.options.onDisconnected(reasonStr);
        this.scheduleReconnect();
      });

      this.ws.on("error", (error) => {
        log(`sharecrm: WebSocket 错误: ${String(error)}`);
        this.options.onError?.(error);
      });

      this.ws.on("ping", () => {
        // ws 库默认自动响应服务端 ping
      });
    } catch (err) {
      log(`sharecrm: 连接失败: ${String(err)}`);
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  /** 处理服务端消息 */
  private handleMessage(msg: ShareCrmServerMessage): void {
    const log = this.options.log ?? console.log;

    switch (msg.type) {
      case "connected":
        this._connected = true;
        log(`sharecrm: 已认证为 ${msg.data.bot_id}`);
        this.options.onConnected(msg.data.bot_id);
        break;

      case "message":
        this.options.onMessage(msg as ShareCrmServerMessage & { type: "message" });
        break;

      case "error":
        log(`sharecrm: 错误 [${msg.error.code}]: ${msg.error.message}`);
        this.options.onError?.(new Error(`[${msg.error.code}] ${msg.error.message}`));
        break;
    }
  }

  /** 通过 REST API 发送消息到指定会话 */
  async sendMessage(chatId: string, text: string): Promise<{ messageId: string; chatId: string } | null> {
    try {
      const token = await this.ensureToken();
      const { apiBaseUrl } = this.options.account;

      const response = await fetch(`${apiBaseUrl}/im-gateway/qixin/message/send`, {
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
      log(`sharecrm: 发送消息失败: ${data.message || "未知错误"}`);
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
