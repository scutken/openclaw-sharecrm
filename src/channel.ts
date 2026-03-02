/**
 * OpenClaw ShareCRM Plugin - Channel 插件入口
 */

import type { ResolvedShareCrmAccount, ShareCrmConfig } from './types.js';
import { startAccountMonitor, stopAccountMonitor } from './monitor.js';
import { setShareCrmRuntime, type PluginRuntime } from './runtime.js';

/**
 * ShareCRM Channel 定义
 */
const shareCrmChannel = {
  id: 'sharecrm',

  meta: {
    id: 'sharecrm',
    label: 'ShareCRM',
    selectionLabel: 'ShareCRM (内部 IM)',
    docsPath: '/channels/sharecrm',
    docsLabel: 'sharecrm',
    blurb: '内部 ShareCRM 渠道，通过 ShareCRM-IM-Gateway 接入。',
    aliases: ['scrm'],
  },

  capabilities: {
    chatTypes: ['direct', 'group'] as const,
    threads: false,
    reactions: false,
    media: false,
    edit: false,
    reply: true,
  },

  config: {
    listAccountIds: (cfg: any): string[] => {
      return Object.keys(cfg.channels?.sharecrm?.accounts ?? { default: {} });
    },

    resolveAccount: (cfg: any, accountId?: string): ResolvedShareCrmAccount => {
      const id = accountId ?? 'default';
      const channelCfg = cfg.channels?.sharecrm ?? {};
      const accountCfg = channelCfg.accounts?.[id] ?? channelCfg;

      return {
        accountId: id,
        enabled: accountCfg.enabled ?? true,
        configured: !!(accountCfg.gatewayUrl && accountCfg.appId && accountCfg.appSecret),
        gatewayUrl: accountCfg.gatewayUrl,
        appId: accountCfg.appId,
        appSecret: accountCfg.appSecret,
        dmPolicy: accountCfg.dmPolicy ?? 'pairing',
        allowFrom: accountCfg.allowFrom ?? [],
        groupPolicy: accountCfg.groupPolicy ?? 'allowlist',
        groupAllowFrom: accountCfg.groupAllowFrom ?? [],
      };
    },
  },

  outbound: {
    deliveryMode: 'direct' as const,

    sendText: async (ctx: {
      text: string;
      channelId: string;
      accountId?: string;
      replyTo?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      const { sendText } = await import('./outbound.js');
      try {
        const result = await sendText(ctx.channelId, ctx.text, ctx.accountId);
        return { ok: result.success, error: result.errorMessage };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  },

  gateway: {
    startAccount: async (
      cfg: any,
      runtime: PluginRuntime,
      abortSignal: AbortSignal,
      accountId?: string
    ): Promise<void> => {
      setShareCrmRuntime(runtime);

      const account = shareCrmChannel.config.resolveAccount(cfg, accountId);

      if (!account.enabled) {
        runtime.logger.info(`[ShareCRM] 账号 ${account.accountId} 未启用`);
        return;
      }

      if (!account.configured) {
        runtime.logger.warn(`[ShareCRM] 账号 ${account.accountId} 配置不完整，需要 gatewayUrl, appId, appSecret`);
        return;
      }

      await startAccountMonitor(account, abortSignal);
    },

    stopAccount: (accountId?: string): void => {
      stopAccountMonitor(accountId ?? 'default');
    },
  },
};

/**
 * OpenClaw Plugin API 类型
 */
interface PluginApi {
  logger: Console;
  registerChannel: (opts: { plugin: typeof shareCrmChannel }) => void;
}

/**
 * 插件注册函数 - OpenClaw 入口点
 */
export default function register(api: PluginApi): void {
  api.logger.info('[ShareCRM] 插件加载中...');
  api.registerChannel({ plugin: shareCrmChannel });
  api.logger.info('[ShareCRM] Channel 已注册');
}

// 导出 channel 定义供测试使用
export { shareCrmChannel };
