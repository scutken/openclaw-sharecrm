/**
 * OpenClaw ShareCRM Plugin - 账号配置解析
 */

import type { ResolvedShareCrmAccount, ShareCrmConfig } from './types.js';

/**
 * 从配置中解析 ShareCRM 账号
 */
export function resolveShareCrmAccount(
  config: Partial<ShareCrmConfig>,
  accountId: string = 'default'
): ResolvedShareCrmAccount {
  const gatewayUrl = config.gatewayUrl;
  const appId = config.appId;
  const appSecret = config.appSecret;

  // 判断是否配置完整
  const configured = !!(gatewayUrl && appId && appSecret);

  return {
    accountId,
    enabled: config.enabled ?? true,
    configured,
    gatewayUrl,
    appId,
    appSecret,
    dmPolicy: config.dmPolicy ?? 'pairing',
    allowFrom: normalizeAllowFrom(config.allowFrom ?? []),
    groupPolicy: config.groupPolicy ?? 'allowlist',
    groupAllowFrom: normalizeAllowFrom(config.groupAllowFrom ?? []),
  };
}

/**
 * 列出所有账号 ID（MVP 版本只支持单账号）
 */
export function listShareCrmAccountIds(): string[] {
  return ['default'];
}

/**
 * 获取默认账号 ID
 */
export function resolveDefaultShareCrmAccountId(): string {
  return 'default';
}

/**
 * 判断账号是否配置完整
 */
export function isConfigured(account: ResolvedShareCrmAccount): boolean {
  return account.configured;
}

/**
 * 规范化 allowFrom 列表
 */
function normalizeAllowFrom(allowFrom: (string | number)[]): string[] {
  return allowFrom
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      // 移除可能的前缀
      if (entry.startsWith('sharecrm:')) {
        return entry.slice(9);
      }
      if (entry.startsWith('user:')) {
        return entry.slice(5);
      }
      return entry;
    });
}

/**
 * 描述账号状态（供 UI 使用）
 */
export function describeAccount(account: ResolvedShareCrmAccount): {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  gatewayUrl?: string;
  appId?: string;
} {
  return {
    accountId: account.accountId,
    enabled: account.enabled,
    configured: account.configured,
    gatewayUrl: account.gatewayUrl,
    appId: account.appId,
  };
}
