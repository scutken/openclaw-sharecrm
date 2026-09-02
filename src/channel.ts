/**
 * ShareCRM OpenClaw 渠道插件
 *
 * 实现 ChannelPlugin 接口，通过 SSE 连接 ShareCRM IM Gateway
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { createChatChannelPlugin, createChannelPluginBase } from "openclaw/plugin-sdk/channel-core";
import { PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk/channel-status";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { shareCrmChannelSchema } from "./channel-schema.js";
import { shareCrmSetupWizard } from "./onboarding.js";
import {
  collectDmPolicyWarnings,
  DEFAULT_DM_POLICY,
  normalizeAllowFrom,
} from "./policy.js";
import {
  getActiveClient,
  getBotInfo,
  isAccountConnected,
  resolveDirectChatIdForUser,
  resolveDirectChatTargetForUser,
} from "./monitor.js";
import type { ResolvedShareCrmAccount, ShareCrmChannelConfig } from "./types.js";

const CHANNEL_ID = "sharecrm";

function normalizeShareCrmTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withoutProvider = trimmed.replace(/^sharecrm:/i, "").trim();
  if (!withoutProvider) return undefined;

  const match = withoutProvider.match(/^(user|chat):(.*)$/i);
  if (!match) return withoutProvider;

  const kind = match[1]?.toLowerCase();
  const value = match[2]?.trim();
  if (!kind || !value) return undefined;
  return `${kind}:${value}`;
}

export function isLikelyShareCrmChatId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const segments = trimmed.split(":");
  if (segments.length !== 4) return false;
  const [env, ea, sessionId] = segments;
  return /^\d+$/.test(env) && Boolean(ea?.trim()) && Boolean(sessionId?.trim());
}

export function isValidShareCrmTarget(value: string): boolean {
  const normalized = normalizeShareCrmTarget(value);
  if (!normalized) return false;
  if (/^chat:/i.test(normalized)) return isLikelyShareCrmChatId(normalized.slice(5));
  if (/^user:/i.test(normalized)) return Boolean(normalized.slice(5).trim());
  return isLikelyShareCrmChatId(normalized);
}

export async function resolveShareCrmSendTarget(params: {
  accountId: string;
  to: string;
  fallbackChatId?: string;
}): Promise<{ chatId: string }> {
  const rawTarget = params.to.trim();
  const fallbackChatId = params.fallbackChatId?.trim();
  const target = normalizeShareCrmTarget(rawTarget) ?? (fallbackChatId && isLikelyShareCrmChatId(fallbackChatId) ? fallbackChatId : undefined);

  if (!target) {
    throw new Error("ShareCRM: target is empty");
  }

  if (/^chat:/i.test(target)) {
    const chatId = target.slice(5).trim();
    if (!isLikelyShareCrmChatId(chatId)) {
      throw new Error(`ShareCRM: invalid target \"${rawTarget || target}\", expected chat:<chat_id> or user:<userId>`);
    }
    return { chatId };
  }

  if (/^user:/i.test(target)) {
    const userId = target.slice(5).trim();
    if (!userId) {
      throw new Error(`ShareCRM: invalid target \"${rawTarget || target}\", expected chat:<chat_id> or user:<userId>`);
    }
    const mappedChatId = resolveDirectChatIdForUser(params.accountId, userId);
    if (!mappedChatId) {
      throw new Error(`ShareCRM: no known chat_id for user \"${userId}\", wait for an inbound DM first or use chat:<chat_id>.`);
    }
    return { chatId: mappedChatId };
  }

  if (isLikelyShareCrmChatId(target)) {
    return { chatId: target };
  }

  const mappedChatId = resolveDirectChatIdForUser(params.accountId, target);
  if (mappedChatId) {
    return { chatId: mappedChatId };
  }

  throw new Error(`ShareCRM: invalid target \"${rawTarget || target}\", expected chat:<chat_id> or user:<userId>`);
}

function createDefaultRuntimeState(accountId: string) {
  return {
    accountId,
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
  };
}

function buildChannelStatusSummary(snapshot: {
  configured?: boolean | null;
  running?: boolean | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
}) {
  return {
    configured: Boolean(snapshot.configured),
    running: Boolean(snapshot.running),
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
  };
}

const meta = {
  id: CHANNEL_ID,
  label: "ShareCRM",
  selectionLabel: "ShareCRM IM",
  blurb: "ShareCRM IM Gateway messaging.",
  order: 95,
};

const shareCrmPluginBase = createChannelPluginBase<ResolvedShareCrmAccount>({
  id: CHANNEL_ID,
  meta: {
    ...meta,
  },
  setupWizard: shareCrmSetupWizard,
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: false,
    threads: false,
    media: true,
    reactions: false,
    edit: false,
    reply: true,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- ShareCRM targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:<userId>` or `chat:<chatId>`.",
      "- ShareCRM inbound images are downloaded on the host and attached as local media paths so sandboxed image tools can read them. Outbound is still plain text only — no markdown rendering, no cards, no media uploads.",
      "- Keep messages concise and well-structured using plain text formatting.",
    ],
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  configSchema: {
    schema: shareCrmChannelSchema,
  },
  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: (_cfg) => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const channelCfg = cfg?.channels?.[CHANNEL_ID] as ShareCrmChannelConfig | undefined;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            [CHANNEL_ID]: {
              ...channelCfg,
              enabled,
            },
          },
        };
      }
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          [CHANNEL_ID]: {
            ...channelCfg,
            accounts: {
              ...channelCfg?.accounts,
              [accountId]: {
                ...channelCfg?.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      };
    },
    deleteAccount: ({ cfg, accountId }) => {
      if (accountId === DEFAULT_ACCOUNT_ID) {
        const next = { ...cfg } as OpenClawConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>)[CHANNEL_ID];
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }
      const channelCfg = cfg?.channels?.[CHANNEL_ID] as ShareCrmChannelConfig | undefined;
      const accounts = { ...channelCfg?.accounts };
      delete accounts[accountId];
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          [CHANNEL_ID]: {
            ...channelCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      gatewayBaseUrl: account.gatewayBaseUrl,
      appId: account.appId,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveAccount(cfg, accountId);
      return normalizeAllowFrom(account.config?.allowFrom);
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean),
  },
  security: {
    collectWarnings: ({ cfg, accountId }) => {
      const account = resolveAccount(cfg, accountId);
      const warnings: string[] = [];
      if (!account.configured) {
        warnings.push(
          `- ShareCRM[${account.accountId}]: not configured (missing gatewayBaseUrl, appId or appSecret).`,
        );
      }
      warnings.push(
        ...collectDmPolicyWarnings({
          accountId: account.accountId,
          dmPolicy: account.config?.dmPolicy,
          allowFrom: account.config?.allowFrom,
        }),
      );
      return warnings;
    },
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg, accountId }) => {
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;
      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            [CHANNEL_ID]: {
              ...(cfg.channels as any)?.[CHANNEL_ID],
              enabled: true,
            },
          },
        };
      }
      const channelCfg = (cfg.channels as any)?.[CHANNEL_ID] as ShareCrmChannelConfig | undefined;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          [CHANNEL_ID]: {
            ...channelCfg,
            accounts: {
              ...channelCfg?.accounts,
              [accountId]: {
                ...channelCfg?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      };
    },
  },
});

async function notifyShareCrmPairingApproval(params: {
  cfg: OpenClawConfig;
  id: string;
  runtime?: { log?: (message: string) => void };
  message: string;
}): Promise<void> {
  const log = params.runtime?.log ?? console.log;
  const normalizedUserId = params.id.replace(/^sharecrm:/i, "").trim();
  if (!normalizedUserId) return;

  const preferredAccount = resolveAccount(params.cfg);
  const target = resolveDirectChatTargetForUser(normalizedUserId, preferredAccount.accountId);
  if (!target) {
    log(`sharecrm: pairing approved for ${normalizedUserId}, but no direct chat_id mapping found; skip notify`);
    return;
  }

  const client = getActiveClient(target.accountId);
  if (!client) {
    log(
      `sharecrm: pairing approved for ${normalizedUserId}, but account ${target.accountId} is not connected`,
    );
    return;
  }

  await client.sendMessage(target.chatId, params.message);
}

export const shareCrmPlugin = createChatChannelPlugin<ResolvedShareCrmAccount>({
  base: {
    id: shareCrmPluginBase.id,
    meta: shareCrmPluginBase.meta,
    setup: shareCrmPluginBase.setup,
    setupWizard: shareCrmPluginBase.setupWizard,
    capabilities: shareCrmPluginBase.capabilities!,
    agentPrompt: shareCrmPluginBase.agentPrompt,
    reload: shareCrmPluginBase.reload,
    configSchema: shareCrmPluginBase.configSchema,
    config: shareCrmPluginBase.config!,
    messaging: {
      normalizeTarget: normalizeShareCrmTarget,
      targetResolver: {
        looksLikeId: (id) => Boolean(id && isValidShareCrmTarget(id)),
        hint: "<chat:<env:ea:sessionId:parentSessionId>|user:<userId>>",
      },
    },
    directory: {
      self: async () => null,
      listPeers: async () => [],
      listGroups: async () => [],
    },
    status: {
      defaultRuntime: createDefaultRuntimeState(DEFAULT_ACCOUNT_ID),
      buildChannelSummary: ({ snapshot }) => ({
        ...buildChannelStatusSummary(snapshot),
      }),
      buildAccountSnapshot: ({ account, runtime }) => ({
        ...(getBotInfo(account.accountId)
          ? {
              botFullId: getBotInfo(account.accountId)?.botFullId,
              protocolVersion: getBotInfo(account.accountId)?.version ?? null,
              maxLifetime: getBotInfo(account.accountId)?.maxLifetime ?? null,
            }
          : {}),
        accountId: account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        name: account.name,
        gatewayBaseUrl: account.gatewayBaseUrl,
        appId: account.appId,
        connected: isAccountConnected(account.accountId),
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
      }),
    },
    gateway: {
      startAccount: async (ctx) => {
        const { monitorShareCrmProvider } = await import("./monitor.js");
        const account = resolveAccount(ctx.cfg, ctx.accountId);
        ctx.log?.info(
          `starting sharecrm[${ctx.accountId}] (gateway: ${account.gatewayBaseUrl || "not configured"})`,
        );
        return monitorShareCrmProvider({
          config: ctx.cfg,
          runtime: ctx.runtime,
          abortSignal: ctx.abortSignal,
          accountId: ctx.accountId,
        });
      },
    },
  },
  security: {
    dm: {
      channelKey: CHANNEL_ID,
      resolvePolicy: (account) => account.config?.dmPolicy,
      resolveAllowFrom: (account) => account.config?.allowFrom ?? [],
      defaultPolicy: DEFAULT_DM_POLICY,
      normalizeEntry: (entry) => entry.replace(/^sharecrm:/i, "").replace(/^user:/i, "").trim(),
    },
    collectWarnings: ({ cfg, accountId }) => {
      const account = resolveAccount(cfg, accountId);
      const warnings: string[] = [];
      if (!account.configured) {
        warnings.push(
          `- ShareCRM[${account.accountId}]: not configured (missing gatewayBaseUrl, appId or appSecret).`,
        );
      }
      warnings.push(
        ...collectDmPolicyWarnings({
          accountId: account.accountId,
          dmPolicy: account.config?.dmPolicy,
          allowFrom: account.config?.allowFrom,
        }),
      );
      return warnings;
    },
  },
  pairing: {
    text: {
      idLabel: "shareCrmUserId",
      message: PAIRING_APPROVED_MESSAGE,
      normalizeAllowEntry: (entry) => entry.replace(/^sharecrm:/i, "").replace(/^user:/i, "").trim(),
      notify: async ({ cfg, id, runtime, message }) =>
        notifyShareCrmPairingApproval({ cfg, id, runtime, message }),
    },
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ cfg, to, text, accountId, replyToId }) => {
      const account = resolveAccount(cfg, accountId ?? undefined);
      const client = getActiveClient(account.accountId);
      if (!client) {
        throw new Error(`ShareCRM client not connected for account ${account.accountId}`);
      }

      const target = to.trim();
      const fallbackChatId = account.config?.chatId?.trim();
      const { chatId } = await resolveShareCrmSendTarget({
        accountId: account.accountId,
        to: target,
        fallbackChatId,
      });

      const result = await client.sendMessage(chatId, text, {
        replyMessageId: replyToId ?? undefined,
      });
      return { channel: CHANNEL_ID, messageId: result.messageId, chatId: result.chatId };
    },
  },
});
