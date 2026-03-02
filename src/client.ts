/**
 * OpenClaw ShareCRM Plugin - WebSocket 客户端封装
 */

import WebSocket from 'ws';
import type {
  Envelope,
  AuthPayload,
  AuthOkPayload,
  AuthErrorPayload,
  PingPayload,
  SendMessagePayload,
  CommandAckPayload,
  PendingMessage,
  ConnectionConfig,
} from './types.js';
import { MessageType, PROTOCOL_VERSION, DEFAULT_CONNECTION_CONFIG } from './types.js';

export interface ShareCrmClientOptions {
  gatewayUrl: string;
  appId: string;
  appSecret: string;
  onEvent: (envelope: Envelope) => void;
  onConnected: (payload: AuthOkPayload) => void;
  onDisconnected: (reason: string) => void;
  onError: (error: Error) => void;
  logger?: Console;
}

export interface TestConnectionResult {
  success: boolean;
  service?: string;
  timestamp?: number;
  error?: string;
  latencyMs?: number;
}

/**
 * 测试 Gateway 网络连通性
 * @param gatewayUrl WebSocket URL (ws://host:port/ws/gateway)
 * @param timeoutMs 超时时间（默认 5000ms）
 */
export async function testConnection(
  gatewayUrl: string,
  timeoutMs: number = 5000
): Promise<TestConnectionResult> {
  const startTime = Date.now();
  
  // 将 ws:// 转换为 http://，wss:// 转换为 https://
  const httpUrl = gatewayUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws\/gateway\/?$/, '/api/ping');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(httpUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        latencyMs: Date.now() - startTime,
      };
    }

    const data = await response.json() as { status: string; service: string; timestamp: number };
    
    return {
      success: data.status === 'ok',
      service: data.service,
      timestamp: data.timestamp,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    const error = err as Error;
    return {
      success: false,
      error: error.name === 'AbortError' ? '连接超时' : error.message,
      latencyMs: Date.now() - startTime,
    };
  }
}

export class ShareCrmClient {
  private ws: WebSocket | null = null;
  private options: ShareCrmClientOptions;
  private config: ConnectionConfig;
  private pendingMessages: Map<string, PendingMessage> = new Map();
  private isConnecting = false;
  private isAuthenticated = false;
  private logger: Console;

  constructor(options: ShareCrmClientOptions, config?: Partial<ConnectionConfig>) {
    this.options = options;
    this.config = { ...DEFAULT_CONNECTION_CONFIG, ...config };
    this.logger = options.logger ?? console;
  }

  /**
   * 建立连接
   */
  async connect(): Promise<void> {
    if (this.ws || this.isConnecting) {
      this.logger.warn('[ShareCrmClient] 已存在连接或正在连接中');
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`[ShareCrmClient] 正在连接: ${this.options.gatewayUrl}`);

        this.ws = new WebSocket(this.options.gatewayUrl);

        const authTimeout = setTimeout(() => {
          if (!this.isAuthenticated) {
            this.logger.error('[ShareCrmClient] 鉴权超时');
            this.disconnect();
            reject(new Error('鉴权超时'));
          }
        }, this.config.authTimeoutMs);

        this.ws.on('open', () => {
          this.logger.info('[ShareCrmClient] WebSocket 连接已建立，发送鉴权请求');
          this.sendAuth();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString()) as Envelope;
            this.handleMessage(message, authTimeout, resolve, reject);
          } catch (e) {
            this.logger.error('[ShareCrmClient] 消息解析失败:', e);
          }
        });

        this.ws.on('close', (code, reason) => {
          this.isConnecting = false;
          this.isAuthenticated = false;
          clearTimeout(authTimeout);
          const reasonStr = reason?.toString() || `code: ${code}`;
          this.logger.info(`[ShareCrmClient] 连接关闭: ${reasonStr}`);
          this.options.onDisconnected(reasonStr);
        });

        this.ws.on('error', (error) => {
          this.isConnecting = false;
          clearTimeout(authTimeout);
          this.logger.error('[ShareCrmClient] WebSocket 错误:', error);
          this.options.onError(error);
          reject(error);
        });

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.ws) {
      this.logger.info('[ShareCrmClient] 断开连接');
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
    this.isAuthenticated = false;
    this.pendingMessages.forEach((pending) => {
      clearTimeout(pending.timeout as number);
      pending.reject(new Error('连接已断开'));
    });
    this.pendingMessages.clear();
  }

  /**
   * 发送消息
   */
  async sendMessage(
    channelId: string,
    text: string,
    replyTo?: string
  ): Promise<CommandAckPayload> {
    if (!this.isAuthenticated || !this.ws) {
      throw new Error('未连接或未鉴权');
    }

    const requestId = this.generateRequestId();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(requestId);
        reject(new Error('发送消息超时'));
      }, 5000);

      this.pendingMessages.set(requestId, { requestId, resolve, reject, timeout });

      const payload: SendMessagePayload = {
        requestId,
        channelId,
        text,
        replyTo,
      };

      this.send({ type: MessageType.COMMAND_SEND_MESSAGE, payload });
    });
  }

  /**
   * 发送鉴权请求
   */
  private sendAuth(): void {
    const payload: AuthPayload = {
      protocolVersion: PROTOCOL_VERSION,
      appId: this.options.appId,
      appSecret: this.options.appSecret,
      capabilities: ['text', 'direct', 'group'],
    };

    this.send({ type: MessageType.AUTH, payload });
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(
    envelope: Envelope,
    authTimeout: number | object,
    connectResolve: () => void,
    connectReject: (error: Error) => void
  ): void {
    this.logger.debug(`[ShareCrmClient] 收到消息: ${envelope.type}`);

    switch (envelope.type) {
      case MessageType.AUTH_OK: {
        clearTimeout(authTimeout as number);
        this.isConnecting = false;
        this.isAuthenticated = true;
        const payload = envelope.payload as AuthOkPayload;
        this.logger.info(`[ShareCrmClient] 鉴权成功: sessionId=${payload.sessionId}`);
        this.options.onConnected(payload);
        connectResolve();
        break;
      }

      case MessageType.AUTH_ERROR: {
        clearTimeout(authTimeout as number);
        this.isConnecting = false;
        const payload = envelope.payload as AuthErrorPayload;
        this.logger.error(`[ShareCrmClient] 鉴权失败: ${payload.message}`);
        connectReject(new Error(payload.message));
        this.disconnect();
        break;
      }

      case MessageType.SYSTEM_PING: {
        const payload = envelope.payload as PingPayload;
        this.send({ type: MessageType.SYSTEM_PONG, payload: { seq: payload.seq } });
        this.logger.debug(`[ShareCrmClient] 收到 ping, 回复 pong: seq=${payload.seq}`);
        break;
      }

      case MessageType.COMMAND_ACK: {
        const payload = envelope.payload as CommandAckPayload;
        const pending = this.pendingMessages.get(payload.requestId);
        if (pending) {
          clearTimeout(pending.timeout as number);
          this.pendingMessages.delete(payload.requestId);
          pending.resolve(payload);
        }
        break;
      }

      case MessageType.MESSAGE_NEW:
        // 转发给事件处理器
        this.options.onEvent(envelope);
        break;

      default:
        this.logger.debug(`[ShareCrmClient] 未处理的消息类型: ${envelope.type}`);
        this.options.onEvent(envelope);
    }
  }

  /**
   * 发送消息到 WebSocket
   */
  private send(envelope: Partial<Envelope>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.error('[ShareCrmClient] WebSocket 未连接');
      return;
    }

    const message: Envelope = {
      type: envelope.type!,
      ts: Date.now(),
      payload: envelope.payload,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 获取连接状态
   */
  get connected(): boolean {
    return this.isAuthenticated;
  }
}
