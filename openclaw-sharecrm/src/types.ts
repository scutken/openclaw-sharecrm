/**
 * ShareCRM IM 渠道插件类型定义
 */

// ============ Gateway 服务端消息 (server → plugin) ============

/** 连接成功确认消息 */
export interface ShareCrmConnectedMessage {
  type: "connected";
  data: {
    bot_id: string;
    bot_name: string;
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

/** 发送结果响应 */
export interface ShareCrmSendResult {
  type: "send_result";
  id: string;
  ok: boolean;
  data?: {
    message_id: string;
  };
}

/** 错误响应 */
export interface ShareCrmErrorMessage {
  type: "error";
  id?: string;
  error: {
    code: string;
    message: string;
  };
}

/** 服务端消息联合类型 */
export type ShareCrmServerMessage =
  | ShareCrmConnectedMessage
  | ShareCrmMessageEvent
  | ShareCrmSendResult
  | ShareCrmErrorMessage;

// ============ 插件 → Gateway 消息 ============

/** 发送消息请求 */
export interface ShareCrmSendRequest {
  type: "send";
  id: string;
  data: {
    chat_id: string;
    text: string;
  };
}

export type ShareCrmClientMessage = ShareCrmSendRequest;

// ============ 渠道配置 ============

/** openclaw.yaml 中 channels.sharecrm 的原始配置 */
export interface ShareCrmChannelConfig {
  enabled?: boolean;
  gatewayUrl?: string;
  botToken?: string;
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
  botToken?: string;
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
  botToken: string;
  config: ShareCrmChannelConfig;
}

/** 内部发送结果 */
export interface ShareCrmSendResultInfo {
  messageId: string;
  chatId: string;
}
