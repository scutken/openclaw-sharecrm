/**
 * OpenClaw ShareCRM Plugin - 插件定义
 */

import type { ResolvedShareCrmAccount } from './types.js';
import {
  resolveShareCrmAccount,
  listShareCrmAccountIds,
  resolveDefaultShareCrmAccountId,
  isConfigured,
  describeAccount,
} from './accounts.js';
import { startAccountMonitor, stopAccountMonitor, getAccountState } from './monitor.js';
import { sendMessage, sendText, replyMessage } from './outbound.js';
import { setShareCrmRuntime, resetShareCrmRuntime, type PluginRuntime } from './runtime.js';

/**
 * ShareCRM 插件元数据
 */
export const shareCrmMeta = {
  id: 'sharecrm',
  label: 'ShareCRM',
  selectionLabel: 'ShareCRM (内部 IM)',
  docsPath: '/channels/sharecrm',
  docsLabel: 'ShareCRM',
  blurb: '内部 ShareCRM 渠道，通过 ShareCRM-IM-Gateway 接入。',
  order: 80,
};

/**
 * ShareCRM 插件能力
 */
export const shareCrmCapabilities = {
  chatTypes: ['direct', 'group'] as const,
  threads: false,
  reactions: false,
  media: false,
  edit: false,
  reply: true,
};

/**
 * ShareCRM 插件定义
 */
export const shareCrmPlugin = {
  meta: shareCrmMeta,
  capabilities: shareCrmCapabilities,

  // 配置相关
  config: {
    listAccountIds: listShareCrmAccountIds,
    resolveAccount: resolveShareCrmAccount,
    defaultAccountId: resolveDefaultShareCrmAccountId,
    isConfigured,
    describeAccount,
  },

  // 安全策略
  security: {
    collectWarnings: (account: ResolvedShareCrmAccount) => {
      const warnings: string[] = [];
      if (account.groupPolicy === 'open' && account.groupAllowFrom.length === 0) {
        warnings.push(
          '群组策略为 "open" 但未设置 groupAllowFrom，机器人可能在所有群中触发'
        );
      }
      return warnings;
    },
  },

  // Gateway 启动入口
  gateway: {
    startAccount: async (
      config: unknown,
      runtime: PluginRuntime,
      abortSignal: AbortSignal,
      accountId?: string
    ): Promise<void> => {
      setShareCrmRuntime(runtime);

      const account = resolveShareCrmAccount(
        config as Record<string, unknown>,
        accountId ?? 'default'
      );

      if (!account.enabled) {
        runtime.logger.info(`[ShareCRM] 账号 ${account.accountId} 未启用`);
        return;
      }

      if (!isConfigured(account)) {
        runtime.logger.warn(`[ShareCRM] 账号 ${account.accountId} 配置不完整`);
        return;
      }

      await startAccountMonitor(account, abortSignal);
    },

    stopAccount: (accountId?: string): void => {
      stopAccountMonitor(accountId ?? 'default');
    },

    cleanup: (): void => {
      resetShareCrmRuntime();
    },
  },

  // 消息发送
  messaging: {
    sendMessage,
    sendText,
    replyMessage,
  },

  // 状态查询
  status: {
    getAccountState,
  },
};

export default shareCrmPlugin;
