/**
 * 插件运行时单例
 * 存储 api.runtime 中的 PluginRuntime（在 register() 时设置）
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setShareCrmRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getShareCrmRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("ShareCRM 运行时未初始化 - 插件尚未注册");
  }
  return runtime;
}
