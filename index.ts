/**
 * OpenClaw ShareCRM Plugin - 入口文件
 */

import type { ResolvedShareCrmAccount } from './src/types.js';
import { startAccountMonitor, stopAccountMonitor } from './src/monitor.js';
import { setShareCrmRuntime, type PluginRuntime } from './src/runtime.js';

/**
 * ShareCRM Channel Plugin 定义
 */
const shareCrmChannelPlugin = {
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
    }): Promise<{ ok: boolean; error?: string }> => {
      const { sendText } = await import('./src/outbound.js');
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

      const account = shareCrmChannelPlugin.config.resolveAccount(cfg, accountId);

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
 * Plugin 配置 Schema
 */
const pluginConfigSchema = {
  toJSONSchema: () => ({
    type: 'object',
    additionalProperties: false,
    properties: {},
  }),
};

/**
 * OpenClaw Plugin API 类型
 */
interface OpenClawPluginApi {
  runtime: PluginRuntime;
  logger: Console;
  registerChannel: (opts: { plugin: typeof shareCrmChannelPlugin }) => void;
}

/**
 * 插件定义
 */
const plugin = {
  id: 'openclaw-sharecrm',
  name: 'ShareCRM Channel',
  description: 'ShareCRM 内部 IM 渠道插件，通过 ShareCRM-IM-Gateway 接入',
  configSchema: pluginConfigSchema,

  register(api: OpenClawPluginApi): void {
    setShareCrmRuntime(api.runtime);
    api.logger.info('[ShareCRM] 插件加载中...');
    api.registerChannel({ plugin: shareCrmChannelPlugin });
    api.logger.info('[ShareCRM] Channel 已注册');
  },
};

export default plugin;
