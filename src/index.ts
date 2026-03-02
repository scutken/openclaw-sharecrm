/**
 * OpenClaw ShareCRM Plugin - 包入口
 * 简化版
 */

// 默认导出 register 函数（OpenClaw 入口点）
export { default } from "./channel.js";

// 导出 channel 定义
export { shareCrmChannel } from "./channel.js";

// API 客户端导出
export {
  ShareCrmClient,
  type ShareCrmClientOptions,
  type MessageEvent,
  type SendResult,
  type BotInfo,
} from "./api.js";

// 配置导出
export {
  ShareCrmConfigSchema,
  type ShareCrmConfig,
  type ShareCrmAccountConfig,
  type ResolvedShareCrmAccount,
} from "./config-schema.js";

// 运行时导出
export {
  setShareCrmRuntime,
  getShareCrmRuntime,
  resetShareCrmRuntime,
  type PluginRuntime,
} from "./runtime.js";
