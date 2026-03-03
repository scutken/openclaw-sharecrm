/**
 * ShareCRM IM Gateway 的 WebSocket 客户端
 *
 * 管理 WebSocket 连接、消息收发和自动重连
 */

import WebSocket from "ws";
import type {
  ShareCrmServerMessage,
  ShareCrmSendResultInfo,
  ResolvedShareCrmAccount,
} from "./types.js";

const RECONNECT_DELAY_MS = 3000;
const SEND_TIMEOUT_MS = 10_000;

export type ShareCrmClientOptions = {
  account: ResolvedShareCrmAccount;
  onConnected: (botId: string, botName: string) => void;
  onMessage: (data: ShareCrmServerMessage & { type: "message" }) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
  log?: (...args: any[]) => void;
};

type PendingRequest = {
  resolve: (result: { ok: boolean; messageId?: string }) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class ShareCrmClient {
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
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

  /** 根据账号配置构建 WebSocket URL */
  private buildUrl(): string {
    const { gatewayUrl, botToken } = this.options.account;
    // gatewayUrl 格式为 "ws://localhost:8099"，botToken 已 Base64 编码
    return `${gatewayUrl}/bot${botToken}`;
  }

  /** 连接到 Gateway */
  connect(): void {
    if (this.ws) {
      return;
    }

    const url = this.buildUrl();
    const log = this.options.log ?? console.log;

    log(`sharecrm: 正在连接 ${url.replace(/\/bot.+$/, "/bot***")}`);

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
  }

  /** 处理服务端消息 */
  private handleMessage(msg: ShareCrmServerMessage): void {
    const log = this.options.log ?? console.log;

    switch (msg.type) {
      case "connected":
        this._connected = true;
        log(`sharecrm: 已认证为 ${msg.data.bot_name} (${msg.data.bot_id})`);
        this.options.onConnected(msg.data.bot_id, msg.data.bot_name);
        break;

      case "message":
        this.options.onMessage(msg as ShareCrmServerMessage & { type: "message" });
        break;

      case "send_result": {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id);
          pending.resolve({ ok: msg.ok, messageId: msg.data?.message_id });
        }
        break;
      }

      case "error": {
        log(`sharecrm: 错误 [${msg.error.code}]: ${msg.error.message}`);
        if (msg.id) {
          const pending = this.pendingRequests.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(msg.id);
            pending.resolve({ ok: false });
          }
        }
        break;
      }
    }
  }

  /** 通过 Gateway 发送消息到指定会话 */
  async sendMessage(chatId: string, text: string): Promise<ShareCrmSendResultInfo | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return null;
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve(null);
      }, SEND_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          if (result.ok && result.messageId) {
            resolve({ messageId: result.messageId, chatId });
          } else {
            resolve(null);
          }
        },
        timeout,
      });

      this.ws!.send(
        JSON.stringify({
          type: "send",
          id,
          data: { chat_id: chatId, text },
        }),
      );
    });
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
    // 清理所有待处理请求
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.resolve({ ok: false });
    }
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
