/**
 * ShareCRM IM 渠道插件类型定义
 */

// ============ SSE 事件类型 ============

/** SSE 连接成功事件 */
export interface ShareCrmSseConnectedEvent {
  type: "connected";
  data: {
    bot_full_id: string;
    version?: string;
    max_lifetime?: number;
  };
}

/** SSE 心跳事件 */
export interface ShareCrmSsePingEvent {
  type: "ping";
  time: number;
}

/** SSE 消息事件 */
export interface ShareCrmSseMessageEvent {
  type: "message";
  data: {
    message_id: string;
    chat_id: string;
    chat_type: "direct" | "group";
    from: {
      id: string;
      name: string;
    };
    text: string;
    date: number;
    qixin?: {
      env: string;
      ea: string;
      session_id: string;
      parent_session_id?: string;
      bot_full_id: string;
      message_type: string;
      qixin_message_id: string;
      reply_message_id?: string;
    };
  };
}

/** SSE 错误事件 */
export interface ShareCrmSseErrorEvent {
  type: "error";
  error: {
    code: string;
    message: string;
  };
}

/** SSE 事件联合类型 */
export type ShareCrmSseEvent =
  | ShareCrmSseConnectedEvent
  | ShareCrmSsePingEvent
  | ShareCrmSseMessageEvent
  | ShareCrmSseErrorEvent;

// ============ 鉴权相关 ============

/** 获取 Token 请求 */
export interface AuthTokenRequest {
  appId: string;
  appSecret: string;
}

/** 获取 Token 响应 */
export interface AuthTokenResponse {
  code: number;
  data?: {
    accessToken: string;
    expiresIn: number;
    tokenType: "Bearer";
  };
  msg?: string;
}

// ============ REST API 类型 (上行, plugin → server) ============

/** 发送消息请求 */
export interface SendMessageRequest {
  chat_id: string;
  text: string;
}

/** 发送消息响应 */
export interface SendMessageResponse {
  code: number;
  data?: {
    message_id: string;
  };
  msg?: string;
}

/** API 通用响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  msg?: string;
}

// ============ 渠道配置 ============

/** openclaw.yaml 中 channels.sharecrm 的原始配置 */
export interface ShareCrmChannelConfig {
  enabled?: boolean;
  gatewayBaseUrl?: string;
  appId?: string;
  appSecret?: string;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom?: (string | number)[];
  groupPolicy?: "open" | "allowlist" | "disabled";
  groupAllowFrom?: (string | number)[];
  requireMention?: boolean;
  chatId?: string;
  historyLimit?: number;
  textChunkLimit?: number;
  accounts?: Record<string, ShareCrmAccountConfigRaw>;
}

/** 单账号原始配置 */
export interface ShareCrmAccountConfigRaw {
  enabled?: boolean;
  name?: string;
  gatewayBaseUrl?: string;
  appId?: string;
  appSecret?: string;
  dmPolicy?: "open" | "pairing" | "allowlist" | "disabled";
  allowFrom?: (string | number)[];
}

/** 解析后的完整账号配置 */
export interface ResolvedShareCrmAccount {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  gatewayBaseUrl: string;
  appId: string;
  appSecret: string;
  config: ShareCrmChannelConfig;
}

/** 内部发送结果 */
export interface ShareCrmSendResultInfo {
  messageId: string;
  chatId: string;
}
