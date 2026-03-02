/**
 * OpenClaw ShareCRM Plugin - 包入口
 */

// 默认导出 register 函数（OpenClaw 入口点）
export { default } from './channel.js';

// 导出 channel 定义
export { shareCrmChannel } from './channel.js';

// 类型导出
export type {
  Envelope,
  AuthPayload,
  AuthOkPayload,
  AuthErrorPayload,
  PingPayload,
  UserInfo,
  MessageNewPayload,
  SendMessagePayload,
  CommandAckPayload,
  ShareCrmConfig,
  ResolvedShareCrmAccount,
  AccountState,
  ConnectionConfig,
  ShareCrmMessageContext,
  PendingMessage,
} from './types.js';

// 常量导出
export { MessageType, PROTOCOL_VERSION, DEFAULT_CONNECTION_CONFIG } from './types.js';

// 客户端导出
export { ShareCrmClient, testConnection, type ShareCrmClientOptions, type TestConnectionResult } from './client.js';

// 账号管理导出
export {
  resolveShareCrmAccount,
  listShareCrmAccountIds,
  resolveDefaultShareCrmAccountId,
  isConfigured,
  describeAccount,
} from './accounts.js';

// 监控导出
export {
  startAccountMonitor,
  stopAccountMonitor,
  getAccountState,
  getClient,
  getAllAccountStates,
} from './monitor.js';

// 消息发送导出
export { sendMessage, sendText, replyMessage } from './outbound.js';

// 运行时导出
export { setShareCrmRuntime, getShareCrmRuntime, resetShareCrmRuntime, type PluginRuntime } from './runtime.js';
