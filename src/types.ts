/**
 * ShareCRM IM 渠道插件类型定义
 */

// ============ SSE 事件类型 ============

/** SSE 连接成功事件 */
export interface ShareCrmSseConnectedEvent {
  type: "connected";
  data: {
    bot_full_id: string;
    protocol_version?: string;
    client_version?: string;
    max_lifetime?: number;
    retry?: number;
  };
}

/** SSE 重置事件 */
export interface ShareCrmSseResetEvent {
  type: "reset";
  reason: string;
}

/** SSE 消息事件 */
export interface ShareCrmSseMessageEvent {
  type: "message";
  version?: string;
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
    message?: {
      type: string;
      content: string;
    };
    timestamp?: number;
    env?: number;
    ea?: string;
    session_id?: string;
    parent_session_id?: string;
    bot_full_id?: string;
    message_type?: string;
    reply_message_id?: number;
    history_messages?: ShareCrmGatewayHistoryMessage[];
  };
}

export interface ShareCrmGatewayHistoryMessage {
  message_id?: string;
  message_type?: string;
  sender_id?: string;
  full_sender_id?: string;
  content?: string;
  message_timestamp?: number;
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
  | ShareCrmSseResetEvent
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
  reply_message_id?: string | number;
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
  groupPolicy?: "open" | "allowlist" | "disabled";
  groupAllowFrom?: (string | number)[];
  historyLimit?: number;
  textChunkLimit?: number;
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
