/**
 * OpenClaw ShareCRM Plugin - 入口文件
 * 简化版：纯 WebSocket 双向通信
 */

export { default } from "./src/channel.js";
export { shareCrmChannel } from "./src/channel.js";
export { ShareCrmClient, type MessageEvent, type SendResult, type BotInfo } from "./src/api.js";
export { ShareCrmConfigSchema, type ShareCrmConfig, type ResolvedShareCrmAccount } from "./src/config-schema.js";
