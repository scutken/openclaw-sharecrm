/**
 * OpenClaw ShareCRM Plugin - Runtime 单例
 */

/**
 * Channel Runtime 接口（用于消息分发）
 */
export interface ChannelRuntime {
  dispatchReplyFromConfig?: (opts: {
    cfg: Record<string, unknown>;
    ctx: Record<string, unknown>;
    deliver: (payload: { text?: string }) => Promise<void>;
  }) => Promise<void>;
  [key: string]: unknown;
}

/**
 * 插件运行时接口
 */
export interface PluginRuntime {
  logger: Console;
  channelRuntime?: ChannelRuntime;
  channel?: {
    reply?: {
      dispatchReplyWithBufferedBlockDispatcher?: (params: {
        ctx: Record<string, unknown>;
        cfg: Record<string, unknown>;
        dispatcherOptions: {
          deliver: (payload: { text?: string }) => Promise<void>;
          onError: (err: unknown, info: { kind: string }) => void;
        };
      }) => Promise<{ queuedFinal?: boolean }>;
    };
  };
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
