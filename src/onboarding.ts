/**
 * ShareCRM onboarding adapter for CLI setup wizard.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  formatDocsLink,
  type ChannelSetupWizard,
  type ChannelSetupDmPolicy,
} from "openclaw/plugin-sdk/channel-setup";
import type { WizardPrompter } from "openclaw/plugin-sdk/setup";
import { resolveAccount } from "./accounts.js";
import { DEFAULT_GATEWAY_BASE_URL } from "./accounts.js";
import { DEFAULT_DM_POLICY, DEFAULT_GROUP_POLICY, DEFAULT_REQUIRE_MENTION } from "./policy.js";
import type { ResolvedShareCrmAccount, ShareCrmChannelConfig } from "./types.js";

const CHANNEL_ID = "sharecrm";
const DEFAULT_ACCOUNT_ID = "default";

function getExistingChannelConfig(cfg: OpenClawConfig): ShareCrmChannelConfig | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.[CHANNEL_ID] as
    | ShareCrmChannelConfig
    | undefined;
}

export function setShareCrmAccount(
  cfg: OpenClawConfig,
  account: Partial<ShareCrmChannelConfig>,
): OpenClawConfig {
  const existing = getExistingChannelConfig(cfg) ?? {};

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [CHANNEL_ID]: {
        ...existing,
        ...account,
        enabled: account.enabled ?? existing.enabled ?? true,
      },
    },
  };
}

async function noteShareCrmSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "ShareCRM 需要配置 IM Gateway 连接信息。",
      "1. 获取 Gateway 基地址 (默认: https://open.fxiaoke.com)",
      "2. 获取应用 appId 和 appSecret",
      "",
      "默认安全策略:",
      "  dmPolicy=pairing（未知私聊用户需要审批）",
      "  groupPolicy=disabled（默认不接入群聊）",
      "  requireMention=true（群聊需 @Bot；企信显示名可配 mentionAliases）",
      "",
      "环境变量支持:",
      "  SHARECRM_GATEWAY_BASE_URL",
      "  SHARECRM_APP_ID, SHARECRM_APP_SECRET",
      `文档: ${formatDocsLink("/channels", "channels")}`,
    ].join("\n"),
    "ShareCRM 配置",
  );
}

function isAccountConfigured(account: ResolvedShareCrmAccount | null): boolean {
  if (!account) return false;
  return Boolean(account.gatewayBaseUrl && account.appId && account.appSecret);
}

const dmPolicy: ChannelSetupDmPolicy = {
  label: "ShareCRM",
  channel: CHANNEL_ID,
  policyKey: `channels.${CHANNEL_ID}.dmPolicy`,
  allowFromKey: `channels.${CHANNEL_ID}.allowFrom`,
  getCurrent: (cfg) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
    return account.config?.dmPolicy ?? DEFAULT_DM_POLICY;
  },
  setPolicy: (cfg, policy) => {
    return setShareCrmAccount(cfg, {
      dmPolicy: policy as "open" | "pairing" | "allowlist" | "disabled",
    });
  },
  promptAllowFrom: async ({ cfg, prompter }) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
    const existingAllowFrom = account.config?.allowFrom ?? [];

    const entry = await prompter.text({
      message: "允许的用户 ID（每行一个；dmPolicy=open 时填 * 才表示对所有人开放）",
      placeholder: "7618",
      initialValue: existingAllowFrom.length > 0
        ? existingAllowFrom.map(String).join("\n")
        : undefined,
    });

    const allowFrom = String(entry ?? "")
      .split(/[\n,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    return setShareCrmAccount(cfg, { allowFrom });
  },
};

export const shareCrmSetupWizard: ChannelSetupWizard = {
  channel: CHANNEL_ID,
  status: {
    configuredLabel: "已配置",
    unconfiguredLabel: "需要配置",
    configuredHint: "ShareCRM 已配置",
    unconfiguredHint: "需要 gatewayBaseUrl、appId、appSecret",
    resolveConfigured: async ({ cfg }) => {
      const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
      return isAccountConfigured(account);
    },
    resolveStatusLines: async ({ cfg, configured }) => {
      const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
      return [
        `ShareCRM: ${configured ? "已配置" : "需要 gatewayBaseUrl、appId、appSecret"}`,
        account?.gatewayBaseUrl ? `Gateway: ${account.gatewayBaseUrl}` : "Gateway: 未设置",
      ];
    },
    resolveSelectionHint: async ({ configured }) => (configured ? "已配置" : "需要配置"),
  },
  prepare: async ({ cfg, prompter }) => {
    const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
    if (!isAccountConfigured(account)) {
      await noteShareCrmSetupHelp(prompter);
    }
  },
  credentials: [
    {
      inputKey: "accessToken",
      providerHint: CHANNEL_ID,
      credentialLabel: "App Secret",
      preferredEnvVar: "SHARECRM_APP_SECRET",
      envPrompt: "Use SHARECRM_APP_SECRET from environment?",
      keepPrompt: "Keep current App Secret?",
      inputPrompt: "App Secret",
      inspect: ({ cfg }) => {
        const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
        const configured = Boolean(account.appSecret);
        return {
          accountConfigured: isAccountConfigured(account),
          hasConfiguredValue: configured,
          resolvedValue: account.appSecret || undefined,
          envValue: process.env.SHARECRM_APP_SECRET?.trim() || undefined,
        };
      },
      applyUseEnv: ({ cfg }) => {
        const envValue = process.env.SHARECRM_APP_SECRET?.trim();
        return envValue ? setShareCrmAccount(cfg, { appSecret: envValue, enabled: true }) : cfg;
      },
      applySet: ({ cfg, resolvedValue }) =>
        setShareCrmAccount(cfg, { appSecret: resolvedValue, enabled: true }),
    },
  ],
  textInputs: [
    {
      inputKey: "url",
      message: "Gateway 基地址",
      placeholder: DEFAULT_GATEWAY_BASE_URL,
      required: true,
      currentValue: async ({ cfg }) => resolveAccount(cfg, DEFAULT_ACCOUNT_ID)?.gatewayBaseUrl,
      initialValue: async ({ cfg }) =>
        resolveAccount(cfg, DEFAULT_ACCOUNT_ID)?.gatewayBaseUrl || process.env.SHARECRM_GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL,
      validate: ({ value }) => {
        const raw = value.trim();
        if (!raw) return "必填";
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) return "地址应以 http:// 或 https:// 开头";
        return undefined;
      },
      applySet: ({ cfg, value }) => setShareCrmAccount(cfg, { gatewayBaseUrl: value, enabled: true }),
    },
    {
      inputKey: "userId",
      message: "App ID",
      placeholder: "bot-001",
      required: true,
      currentValue: async ({ cfg }) => resolveAccount(cfg, DEFAULT_ACCOUNT_ID)?.appId,
      initialValue: async ({ cfg }) =>
        resolveAccount(cfg, DEFAULT_ACCOUNT_ID)?.appId || process.env.SHARECRM_APP_ID?.trim() || "",
      validate: ({ value }) => (value.trim() ? undefined : "必填"),
      applySet: ({ cfg, value }) => setShareCrmAccount(cfg, { appId: value, enabled: true }),
    },
  ],
  dmPolicy,
  completionNote: {
    title: "ShareCRM 已配置",
    lines: [
      `默认 dmPolicy=${DEFAULT_DM_POLICY}，未知私聊用户需要审批。`,
      `默认 groupPolicy=${DEFAULT_GROUP_POLICY}，群聊需显式开启；开启后默认 requireMention=${String(DEFAULT_REQUIRE_MENTION)}。`,
      `文档: ${formatDocsLink("/channels", "channels")}`,
    ],
  },
  disable: (cfg) => {
    const sharecrm = getExistingChannelConfig(cfg);
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [CHANNEL_ID]: { ...sharecrm, enabled: false },
      },
    };
  },
};
