/**
 * ShareCRM WebSocket API 客户端
 * 简化的双向通信实现
 */

import WebSocket from "ws";

// ============ 类型定义 ============

export type BotInfo = {
  ok: boolean;
  result?: { bot_id: string; bot_name: string };
  error?: string;
};

export type MessageEvent = {
  message_id: string;
  chat_id: string;
  chat_type: "direct" | "group";
  from: { id: string; name: string };
  text: string;
  date: number;
};

export type SendResult = {
  ok: boolean;
  result?: { message_id: string };
  error?: string;
};

type PendingRequest = {
  resolve: (result: SendResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export interface ShareCrmClientOptions {
  gatewayUrl: string;
  botToken: string;
  onMessage: (event: MessageEvent) => void;
  onConnected: (info: BotInfo) => void;
  onDisconnected: (reason: string) => void;
  onError?: (error: Error) => void;
  logger?: Console;
}

// ============ WebSocket 客户端 ============

/**
 * ShareCRM WebSocket 客户端
 */
export class ShareCrmClient {
  private ws: WebSocket | null = null;
  private options: ShareCrmClientOptions;
  private pendingRequests = new Map<string, PendingRequest>();
  private logger: Console;
  private reconnecting = false;

  constructor(options: ShareCrmClientOptions) {
    this.options = options;
    this.logger = options.logger ?? console;
  }

  /**
   * 建立 WebSocket 连接
   */
  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.logger.warn("[ShareCRM] 已存在连接");
      return;
    }

    const url = `${this.options.gatewayUrl}/bot${this.options.botToken}`;
    this.logger.info(`[ShareCRM] 正在连接: ${url.replace(this.options.botToken, "***")}`);

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.logger.info("[ShareCRM] WebSocket 连接已建立");
      this.reconnecting = false;
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(msg);
      } catch (e) {
        this.logger.error("[ShareCRM] 消息解析失败:", e);
      }
    });

    this.ws.on("close", (code, reason) => {
      const reasonStr = reason?.toString() || `code: ${code}`;
      this.logger.info(`[ShareCRM] 连接关闭: ${reasonStr}`);
      this.clearPendingRequests("连接已断开");
      this.options.onDisconnected(reasonStr);
    });

    this.ws.on("error", (error) => {
      this.logger.error("[ShareCRM] WebSocket 错误:", error);
      this.options.onError?.(error);
    });
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(msg: {
    type: string;
    id?: string;
    data?: unknown;
    ok?: boolean;
    error?: { code?: string; message?: string };
  }): void {
    this.logger.debug?.(`[ShareCRM] 收到消息: ${msg.type}`);

    switch (msg.type) {
      case "connected":
        this.options.onConnected({
          ok: true,
          result: msg.data as { bot_id: string; bot_name: string },
        });
        break;

      case "message":
        this.options.onMessage(msg.data as MessageEvent);
        break;

      case "send_result": {
        const pending = this.pendingRequests.get(msg.id!);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(msg.id!);
          pending.resolve({
            ok: msg.ok ?? true,
            result: msg.data as { message_id: string },
          });
        }
        break;
      }

      case "error": {
        const pendingErr = this.pendingRequests.get(msg.id!);
        if (pendingErr) {
          clearTimeout(pendingErr.timeout);
          this.pendingRequests.delete(msg.id!);
          pendingErr.resolve({
            ok: false,
            error: msg.error?.message ?? "Unknown error",
          });
        } else {
          this.logger.error(`[ShareCRM] 错误: ${msg.error?.message}`);
        }
        break;
      }

      default:
        this.logger.debug?.(`[ShareCRM] 未处理的消息类型: ${msg.type}`);
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(chatId: string, text: string): Promise<SendResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: "未连接" };
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({ ok: false, error: "发送超时" });
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject: () => {}, timeout });

      this.ws!.send(
        JSON.stringify({
          type: "send",
          id,
          data: { chat_id: chatId, text },
        })
      );
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.logger.info("[ShareCRM] 断开连接");
      this.ws.close();
      this.ws = null;
    }
    this.clearPendingRequests("主动断开");
  }

  /**
   * 清理待处理请求
   */
  private clearPendingRequests(reason: string): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.resolve({ ok: false, error: reason });
    });
    this.pendingRequests.clear();
  }

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
