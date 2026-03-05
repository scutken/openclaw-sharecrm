/**
 * ShareCRM 渠道账号解析
 * 读取 channels.sharecrm 配置，合并单账号覆盖项
 */

import type { ShareCrmChannelConfig, ResolvedShareCrmAccount } from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_GATEWAY_BASE_URL = "https://open.fxiaoke.com";

/** 从完整配置中提取渠道配置 */
function getChannelConfig(cfg: any): ShareCrmChannelConfig | undefined {
  return cfg?.channels?.sharecrm;
}

/**
 * 列出所有已配置的账号 ID
 * 如果基础配置有凭证则返回 ["default"]，加上命名账号
 */
export function listAccountIds(cfg: any): string[] {
  const channelCfg = getChannelConfig(cfg);
  if (!channelCfg) return [];

  const ids = new Set<string>();

  // 如果基础配置有 appId + appSecret，则存在 "default" 账号
  const hasBaseCredentials =
    (channelCfg.appId && channelCfg.appSecret) ||
    (process.env.SHARECRM_APP_ID && process.env.SHARECRM_APP_SECRET);
  if (hasBaseCredentials) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  // 命名账号
  if (channelCfg.accounts) {
    for (const id of Object.keys(channelCfg.accounts)) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

/**
 * 根据 ID 解析指定账号的完整配置（应用默认值）
 */
export function resolveAccount(cfg: any, accountId?: string | null): ResolvedShareCrmAccount {
  const channelCfg = getChannelConfig(cfg) ?? {};
  const id = accountId || DEFAULT_ACCOUNT_ID;

  // 账号级别的覆盖配置
  const accountOverride = channelCfg.accounts?.[id] ?? {};

  // 环境变量回退
  const envGatewayBaseUrl = process.env.SHARECRM_GATEWAY_BASE_URL ?? "";
  const envAppId = process.env.SHARECRM_APP_ID ?? "";
  const envAppSecret = process.env.SHARECRM_APP_SECRET ?? "";

  const gatewayBaseUrl = accountOverride.gatewayBaseUrl ?? channelCfg.gatewayBaseUrl ?? (envGatewayBaseUrl || DEFAULT_GATEWAY_BASE_URL);
  const appId = accountOverride.appId ?? channelCfg.appId ?? envAppId;
  const appSecret = accountOverride.appSecret ?? channelCfg.appSecret ?? envAppSecret;

  const configured = Boolean(gatewayBaseUrl && appId && appSecret);

  return {
    accountId: id,
    enabled: accountOverride.enabled ?? channelCfg.enabled ?? true,
    configured,
    name: accountOverride.name,
    gatewayBaseUrl,
    appId,
    appSecret,
    config: channelCfg,
  };
}

/**
 * 列出所有已启用且已配置的账号
 */
export function listEnabledAccounts(cfg: any): ResolvedShareCrmAccount[] {
  return listAccountIds(cfg)
    .map((id) => resolveAccount(cfg, id))
    .filter((a) => a.enabled && a.configured);
}
