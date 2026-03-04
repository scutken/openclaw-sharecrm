/**
 * ShareCRM IM 渠道插件类型定义
 */

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
  message?: string;
}

// ============ Gateway 服务端消息 (下行, server → plugin) ============

/** 连接成功确认消息 */
export interface ShareCrmConnectedMessage {
  type: "connected";
  data: {
    bot_id: string;
  };
}

/** 用户入站消息 */
export interface ShareCrmMessageEvent {
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
    date: number; // Unix 时间戳（秒）
  };
}

/** 错误响应 */
export interface ShareCrmErrorMessage {
  type: "error";
  error: {
    code: string;
    message: string;
  };
}

/** 服务端下行消息联合类型 */
export type ShareCrmServerMessage =
  | ShareCrmConnectedMessage
  | ShareCrmMessageEvent
  | ShareCrmErrorMessage;

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
  message?: string;
}

/** API 通用响应 */
export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

// ============ 渠道配置 ============

/** openclaw.yaml 中 channels.sharecrm 的原始配置 */
export interface ShareCrmChannelConfig {
  enabled?: boolean;
  gatewayUrl?: string;
  apiBaseUrl?: string;
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
  gatewayUrl?: string;
  apiBaseUrl?: string;
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
  gatewayUrl: string;
  apiBaseUrl: string;
  appId: string;
  appSecret: string;
  config: ShareCrmChannelConfig;
}

/** 内部发送结果 */
export interface ShareCrmSendResultInfo {
  messageId: string;
  chatId: string;
}
