/**
 * 插件运行时单例
 * 存储 api.runtime 中的 PluginRuntime（在 register() 时设置）
 */

import type { PluginRuntime } from "openclaw/plugin-sdk/core";

let runtime: PluginRuntime | null = null;

export function setShareCrmRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function tryGetShareCrmRuntime(): PluginRuntime | null {
  return runtime;
}

export function getShareCrmRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("ShareCRM runtime is not initialized");
  }
  return runtime;
}
