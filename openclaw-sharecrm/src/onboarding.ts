/**
 * ShareCRM onboarding adapter for CLI setup wizard.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  formatDocsLink,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type WizardPrompter,
} from "openclaw/plugin-sdk";
import { resolveAccount } from "./accounts.js";
import type { ResolvedShareCrmAccount, ShareCrmChannelConfig } from "./types.js";

const CHANNEL_ID = "sharecrm";
const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_GATEWAY_BASE_URL = "https://open.fxiaoke.com";

/**
 * Set ShareCRM account configuration
 */
function setShareCrmAccount(
  cfg: OpenClawConfig,
  account: Partial<ShareCrmChannelConfig>,
): OpenClawConfig {
  const existing = (cfg.channels as Record<string, unknown>)?.[CHANNEL_ID] as
    | ShareCrmChannelConfig
    | undefined;

  const merged: ShareCrmChannelConfig = {
    enabled: account.enabled ?? existing?.enabled ?? true,
    gatewayBaseUrl: account.gatewayBaseUrl ?? existing?.gatewayBaseUrl ?? DEFAULT_GATEWAY_BASE_URL,
    appId: account.appId ?? existing?.appId ?? "",
    appSecret: account.appSecret ?? existing?.appSecret ?? "",
    dmPolicy: account.dmPolicy ?? existing?.dmPolicy ?? "open",
    allowFrom: account.allowFrom ?? existing?.allowFrom,
  };

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_ID]: merged,
    },
  };
}

/**
 * Note about ShareCRM setup
 */
async function noteShareCrmSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "ShareCRM 需要配置 IM Gateway 连接信息。",
      "1. 获取 Gateway 基地址 (默认: https://open.fxiaoke.com)",
      "2. 获取应用 appId 和 appSecret",
      "",
      "环境变量支持:",
      "  SHARECRM_GATEWAY_BASE_URL",
      "  SHARECRM_APP_ID, SHARECRM_APP_SECRET",
      `文档: ${formatDocsLink("/channels/sharecrm", "channels/sharecrm")}`,
    ].join("\n"),
    "ShareCRM 配置",
  );
}

/**
 * Prompt for Gateway Base URL
 */
async function promptGatewayBaseUrl(
  prompter: WizardPrompter,
  account: ResolvedShareCrmAccount | null,
): Promise<string> {
  const envValue = process.env.SHARECRM_GATEWAY_BASE_URL?.trim();
  return String(
    await prompter.text({
      message: "Gateway 基地址",
      initialValue: account?.gatewayBaseUrl || envValue || DEFAULT_GATEWAY_BASE_URL,
      placeholder: DEFAULT_GATEWAY_BASE_URL,
      validate: (value) => {
        const raw = String(value ?? "").trim();
        if (!raw) return "必填";
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
          return "地址应以 http:// 或 https:// 开头";
        }
        return undefined;
      },
    }),
  ).trim();
}

/**
 * Prompt for App ID
 */
async function promptAppId(
  prompter: WizardPrompter,
  account: ResolvedShareCrmAccount | null,
): Promise<string> {
  const envValue = process.env.SHARECRM_APP_ID?.trim();
  return String(
    await prompter.text({
      message: "App ID",
      initialValue: account?.appId || envValue || "",
      placeholder: "bot-001",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
}

/**
 * Prompt for App Secret
 */
async function promptAppSecret(
  prompter: WizardPrompter,
  account: ResolvedShareCrmAccount | null,
): Promise<string> {
  const envValue = process.env.SHARECRM_APP_SECRET?.trim();
  const existing = account?.appSecret;

  // If we have an existing secret and no env var, ask if we should keep it
  if (existing && !envValue) {
    const keep = await prompter.confirm({
      message: "App Secret 已配置，是否保留？",
      initialValue: true,
    });
    if (keep) return existing;
  }

  return String(
    await prompter.text({
      message: "App Secret",
      initialValue: envValue || "",
      validate: (value) => (value?.trim() ? undefined : "必填"),
    }),
  ).trim();
}

/**
 * Check if account is configured
 */
function isAccountConfigured(account: ResolvedShareCrmAccount | null): boolean {
  if (!account) return false;
  return Boolean(
    account.gatewayBaseUrl && account.appId && account.appSecret,
  );
}

/**
 * DM policy configuration
 */
const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "ShareCRM",
  channel: CHANNEL_ID,
  policyKey: `channels.${CHANNEL_ID}.dmPolicy`,
  allowFromKey: `channels.${CHANNEL_ID}.allowFrom`,
  getCurrent: (cfg) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
    return account.config?.dmPolicy ?? "open";
  },
  setPolicy: (cfg, policy) => {
    return setShareCrmAccount(cfg, { dmPolicy: policy as "open" | "pairing" | "allowlist" | "disabled" });
  },
  promptAllowFrom: async ({ cfg, prompter }) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
    const existingAllowFrom = account.config?.allowFrom ?? [];

    const entry = await prompter.text({
      message: "允许的用户 ID（每行一个，用于安全限制）",
      placeholder: "user-001",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    });

    const allowFrom = String(entry ?? "")
      .split(/[\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    return setShareCrmAccount(cfg, { allowFrom });
  },
};

/**
 * ShareCRM onboarding adapter
 */
export const shareCrmOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: CHANNEL_ID,

  getStatus: async ({ cfg }) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
    const configured = isAccountConfigured(account);

    return {
      channel: CHANNEL_ID,
      configured,
      statusLines: [
        `ShareCRM: ${configured ? "已配置" : "需要 appId, appSecret"}`,
      ],
      selectionHint: configured ? "已配置" : "需要配置",
    };
  },

  configure: async ({ cfg, prompter, forceAllowFrom }) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);

    if (!isAccountConfigured(account)) {
      await noteShareCrmSetupHelp(prompter);
    }

    // Prompt for credentials
    const gatewayBaseUrl = await promptGatewayBaseUrl(prompter, account);
    const appId = await promptAppId(prompter, account);
    const appSecret = await promptAppSecret(prompter, account);

    let cfgWithAccount = setShareCrmAccount(cfg, {
      gatewayBaseUrl,
      appId,
      appSecret,
      enabled: true,
    });

    // Handle allowFrom if forced
    if (forceAllowFrom && dmPolicy.promptAllowFrom) {
      cfgWithAccount = await dmPolicy.promptAllowFrom({ cfg: cfgWithAccount, prompter });
    }

    // Prompt for access control
    // Map dmPolicy to ChannelAccessPolicy (pairing maps to allowlist)
    const dmPolicyValue = account.config?.dmPolicy ?? "open";
    const currentPolicy: "open" | "allowlist" | "disabled" =
      dmPolicyValue === "pairing" ? "allowlist" : dmPolicyValue === "open" ? "open" :
      dmPolicyValue === "disabled" ? "disabled" : "allowlist";

    const accessConfig = await promptChannelAccessConfig({
      prompter,
      label: "ShareCRM 私聊",
      currentPolicy,
      currentEntries: (account.config?.allowFrom ?? []).map(String),
      placeholder: "user-001",
      updatePrompt: isAccountConfigured(account),
    });

    if (accessConfig) {
      cfgWithAccount = setShareCrmAccount(cfgWithAccount, {
        dmPolicy: accessConfig.policy as "open" | "pairing" | "allowlist" | "disabled",
        allowFrom: accessConfig.entries,
      });
    }

    return { cfg: cfgWithAccount };
  },

  dmPolicy,

  disable: (cfg) => {
    const sharecrm = (cfg.channels as Record<string, unknown>)?.[CHANNEL_ID] as
      | ShareCrmChannelConfig
      | undefined;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_ID]: { ...sharecrm, enabled: false },
      },
    };
  },
};
