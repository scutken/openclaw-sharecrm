/**
 * OpenClaw ShareCRM Plugin - 类型定义
 */

// ============ 协议消息类型 ============

/**
 * 消息信封 - 所有 WebSocket 消息的统一格式
 */
export interface Envelope<T = unknown> {
  type: string;
  seq?: number;
  ts?: number;
  payload: T;
}

/**
 * 鉴权请求载荷
 */
export interface AuthPayload {
  protocolVersion: string;
  appId: string;
  appSecret: string;
  capabilities: string[];
}

/**
 * 鉴权成功响应载荷
 */
export interface AuthOkPayload {
  sessionId: string;
  heartbeatIntervalMs: number;
  botId: string;
  botName: string;
}

/**
 * 鉴权失败响应载荷
 */
export interface AuthErrorPayload {
  code: string;
  message: string;
}

/**
 * 心跳载荷
 */
export interface PingPayload {
  seq: number;
}

/**
 * 用户信息
 */
export interface UserInfo {
  userId: string;
  name: string;
}

/**
 * 新消息事件载荷
 */
export interface MessageNewPayload {
  chatType: 'direct' | 'group';
  channelId: string;
  messageId: string;
  from: UserInfo;
  text: string;
  mentions: string[];
}

/**
 * 发送消息命令载荷
 */
export interface SendMessagePayload {
  requestId: string;
  channelId: string;
  text: string;
  replyTo?: string;
}

/**
 * 命令确认载荷
 */
export interface CommandAckPayload {
  requestId: string;
  success: boolean;
  messageId?: string;
  errorMessage?: string;
}

// ============ 配置类型 ============

/**
 * ShareCRM 插件配置
 */
export interface ShareCrmConfig {
  enabled: boolean;
  gatewayUrl: string;
  appId: string;
  appSecret: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
}

/**
 * 解析后的 ShareCRM 账号
 */
export interface ResolvedShareCrmAccount {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  gatewayUrl?: string;
  appId?: string;
  appSecret?: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  allowFrom: string[];
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  groupAllowFrom: string[];
}

/**
 * 账号运行状态
 */
export interface AccountState {
  connected: boolean;
  reconnectAttempts: number;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  lastError?: string;
  lastSeq: number;
  lastInboundAt?: Date;
  lastOutboundAt?: Date;
  sessionId?: string;
  botId?: string;
  botName?: string;
}

/**
 * 连接配置
 */
export interface ConnectionConfig {
  authTimeoutMs: number;
  heartbeatIntervalMs: number;
  reconnectDelays: number[];
  maxReconnectAttempts: number;
}

/**
 * 消息上下文 - 传递给业务处理的消息信息
 */
export interface ShareCrmMessageContext {
  accountId: string;
  chatType: 'direct' | 'group';
  channelId: string;
  messageId: string;
  from: UserInfo;
  text: string;
  mentions: string[];
  sessionKey: string;
}

/**
 * 待发送消息
 */
export interface PendingMessage {
  requestId: string;
  resolve: (result: CommandAckPayload) => void;
  reject: (error: Error) => void;
  timeout: number | object; // Timer handle
}

// ============ 常量 ============

/**
 * 协议版本
 */
export const PROTOCOL_VERSION = '1.0';

/**
 * 消息类型
 */
export const MessageType = {
  AUTH: 'auth',
  AUTH_OK: 'auth.ok',
  AUTH_ERROR: 'auth.error',
  SYSTEM_PING: 'system.ping',
  SYSTEM_PONG: 'system.pong',
  MESSAGE_NEW: 'message.new',
  COMMAND_SEND_MESSAGE: 'command.sendMessage',
  COMMAND_ACK: 'command.ack',
} as const;

/**
 * 默认连接配置
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  authTimeoutMs: 10000,
  heartbeatIntervalMs: 30000,
  reconnectDelays: [1000, 2000, 5000, 10000],
  maxReconnectAttempts: 10,
};
