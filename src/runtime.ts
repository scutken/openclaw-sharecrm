/**
 * OpenClaw ShareCRM Plugin - Runtime 单例
 */

import type { ShareCrmMessageContext } from './types.js';

/**
 * 插件运行时接口
 */
export interface PluginRuntime {
  logger: Console;
  routeMessage?: (context: ShareCrmMessageContext) => Promise<void>;
}

let currentRuntime: PluginRuntime | null = null;

/**
 * 设置运行时
 */
export function setShareCrmRuntime(runtime: PluginRuntime): void {
  currentRuntime = runtime;
}

/**
 * 获取运行时
 */
export function getShareCrmRuntime(): PluginRuntime | null {
  return currentRuntime;
}

/**
 * 重置运行时
 */
export function resetShareCrmRuntime(): void {
  currentRuntime = null;
}
