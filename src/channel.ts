/**
 * ShareCRM OpenClaw 渠道插件
 *
 * 实现 ChannelPlugin 接口，通过 SSE 连接 ShareCRM IM Gateway
 */

import type { ChannelMeta, ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import {
  buildBaseChannelStatusSummary,
  createDefaultChannelRuntimeState,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
} from "openclaw/plugin-sdk";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { shareCrmOnboardingAdapter } from "./onboarding.js";
import {
  getActiveClient,
  resolveDirectChatIdForUser,
  resolveDirectChatTargetForUser,
} from "./monitor.js";
import type { ResolvedShareCrmAccount, ShareCrmChannelConfig } from "./types.js";

const CHANNEL_ID = "sharecrm";

const meta: ChannelMeta = {
  id: CHANNEL_ID,
  label: "ShareCRM",
  selectionLabel: "ShareCRM IM",
  docsPath: "/channels/sharecrm",
  docsLabel: "sharecrm",
  blurb: "ShareCRM IM Gateway messaging.",
  order: 95,
};

export const shareCrmPlugin: ChannelPlugin<ResolvedShareCrmAccount> = {
  id: CHANNEL_ID,
  meta: {
    ...meta,
  },
  onboarding: shareCrmOnboardingAdapter,
  pairing: {
    idLabel: "shareCrmUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^sharecrm:/i, "").trim(),
    notifyApproval: async ({ cfg, id, runtime }) => {
      const log = runtime?.log ?? console.log;
      const normalizedUserId = id.replace(/^sharecrm:/i, "").trim();
      if (!normalizedUserId) return;

      const preferredAccount = resolveAccount(cfg);
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

      await client.sendMessage(target.chatId, PAIRING_APPROVED_MESSAGE);
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false,
  },
  agentPrompt: {
    messageToolHints: () => [
      "- ShareCRM targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:<userId>` or `chat:<chatId>`.",
      "- ShareCRM supports text messages only. No markdown rendering, no cards, no media uploads.",
      "- Keep messages concise and well-structured using plain text formatting.",
    ],
  },
  reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        gatewayBaseUrl: { type: "string" },
        appId: { type: "string" },
        appSecret: { type: "string" },
        dmPolicy: {
          type: "string",
          enum: ["open", "pairing", "allowlist", "disabled"],
        },
        allowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
        groupPolicy: {
          type: "string",
          enum: ["open", "allowlist", "disabled"],
        },
        groupAllowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
        requireMention: { type: "boolean" },
        chatId: { type: "string" },
        historyLimit: { type: "integer", minimum: 0 },
        textChunkLimit: { type: "integer", minimum: 1 },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              name: { type: "string" },
              gatewayBaseUrl: { type: "string" },
              appId: { type: "string" },
              appSecret: { type: "string" },
            },
          },
        },
      },
    },
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
      return (account.config?.allowFrom ?? []).map((entry) => String(entry));
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
      if (account.config?.dmPolicy === "open") {
        warnings.push(
          `- ShareCRM[${account.accountId}]: dmPolicy="open" allows any user to message the bot.`,
        );
      }
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
  messaging: {
    normalizeTarget: (raw) => {
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
    },
    targetResolver: {
      looksLikeId: (id) => {
        const trimmed = id?.trim();
        if (!trimmed) return false;
        return /^(ch-|u-|sharecrm:|user:|chat:)/i.test(trimmed) || trimmed.length > 2;
      },
      hint: "<chatId|user:userId|chat:chatId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async () => [],
    listGroups: async () => [],
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveAccount(cfg, accountId ?? undefined);
      const client = getActiveClient(account.accountId);
      if (!client) {
        throw new Error(`ShareCRM client not connected for account ${account.accountId}`);
      }

      const target = to.trim();
      if (!target) {
        throw new Error("ShareCRM: target is empty");
      }

      let chatId = target;
      if (/^chat:/i.test(target)) {
        chatId = target.slice(5).trim();
      } else if (/^user:/i.test(target)) {
        const userId = target.slice(5).trim();
        const mappedChatId = resolveDirectChatIdForUser(account.accountId, userId);
        if (!mappedChatId) {
          throw new Error(
            `ShareCRM: no known direct chat_id for user ${userId}. Reply from an inbound DM first or use chat:<chat_id>.`,
          );
        }
        chatId = mappedChatId;
      } else {
        const mappedChatId = resolveDirectChatIdForUser(account.accountId, target);
        if (mappedChatId) {
          chatId = mappedChatId;
        }
      }

      if (!chatId) {
        throw new Error("ShareCRM: resolved chat_id is empty");
      }

      const result = await client.sendMessage(chatId, text);
      if (!result) {
        throw new Error("ShareCRM: failed to send message");
      }
      return { channel: CHANNEL_ID, ...result };
    },
  },
  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID, {}),
    buildChannelSummary: ({ snapshot }) => ({
      ...buildBaseChannelStatusSummary(snapshot),
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      gatewayBaseUrl: account.gatewayBaseUrl,
      appId: account.appId,
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
};
