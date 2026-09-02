/**
 * ShareCRM Gateway 监控器
 *
 * 管理与 ShareCRM IM Gateway 的 SSE 连接，
 * 分发入站消息给 Agent，处理回复
 */

import type {
  RuntimeEnv,
} from "openclaw/plugin-sdk/runtime-env";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ReplyPayload } from "openclaw/plugin-sdk/reply-runtime";
import type { HistoryEntry } from "openclaw/plugin-sdk/reply-history";
import {
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  DEFAULT_GROUP_HISTORY_LIMIT,
  recordPendingHistoryEntryIfEnabled,
} from "openclaw/plugin-sdk/reply-history";
import { createChannelPairingController } from "openclaw/plugin-sdk/channel-pairing";
import { resolveAccount, listEnabledAccounts } from "./accounts.js";
import { ShareCrmClient } from "./client.js";
import { getShareCrmRuntime, tryGetShareCrmRuntime } from "./runtime.js";
import { loadDirectChatBindings, loadLastEventId, persistDirectChatBindings, persistLastEventId } from "./state.js";
import {
  DEFAULT_DM_POLICY,
  DEFAULT_GROUP_POLICY,
  DEFAULT_REQUIRE_MENTION,
  isDirectMessageAuthorized,
  isSelfBotMessage,
  normalizeAllowFrom,
} from "./policy.js";
import {
  ACK_THROTTLE_MS,
  buildGroupRejectHint,
  extractAtMentionNames,
  isLikelyCommandText,
  pickMessage,
  REJECT_HINT_THROTTLE_MS,
  renderStatusMessage,
  resolveAckSettings,
  resolveProgressSettings,
  progressOffsetMs,
  type GroupRejectReason,
} from "./status-messages.js";
import { stageInboundImages } from "./inbound-media.js";
import type {
  ResolvedShareCrmAccount,
  ShareCrmGatewayHistoryMessage,
  ShareCrmSseEvent,
} from "./types.js";

const CHANNEL_ID = "sharecrm";

function logShareCrm(runtime: RuntimeEnv | undefined, level: "info" | "error", message: string): void {
  if (level === "info") {
    if (typeof runtime?.log === "function") {
      runtime.log(message);
      return;
    }
    console.log(message);
    return;
  }

  if (typeof runtime?.error === "function") {
    runtime.error(message);
    return;
  }
  if (typeof runtime?.log === "function") {
    runtime.log(message);
    return;
  }
  console.error(message);
}

// 各账号的活跃客户端
const activeClients = new Map<string, ShareCrmClient>();
// 各账号的 Bot 信息
const botInfo = new Map<string, { botFullId: string; version?: string; maxLifetime?: number }>();
// Direct 消息会话映射: accountId -> (userId -> chatId)
const directChatByUserByAccount = new Map<string, Map<string, string>>();
type ChatProgressState = {
  startedAt: number;
  round: number;
  maxTimes: number;
  delayMs: number;
  intervalMs: number;
  scheduleMs?: number[];
  messages: string[];
  senderName: string;
  botName: string;
  timer?: ReturnType<typeof setTimeout>;
  formalStarted: boolean;
};
const progressByChat = new Map<string, ChatProgressState>();
const lastAckAtByChat = new Map<string, number>();
const lastRejectHintAtByChat = new Map<string, number>();

function progressKey(accountId: string, chatId: string): string {
  return `${accountId}:${chatId}`;
}

function rejectHintKey(accountId: string, chatId: string, reason: GroupRejectReason): string {
  return `${accountId}:${chatId}:${reason}`;
}

function looksLikeBotAddress(text: string, mentioned: boolean): boolean {
  return mentioned || /@/.test(text);
}

async function sendGroupRejectHint(params: {
  accountId: string;
  chatId: string;
  client: ShareCrmClient;
  reason: GroupRejectReason;
  names?: string[];
  replyMessageId?: string | number;
  error: (message: string) => void;
}): Promise<void> {
  const key = rejectHintKey(params.accountId, params.chatId, params.reason);
  const now = Date.now();
  const lastAt = lastRejectHintAtByChat.get(key) ?? 0;
  if (now - lastAt < REJECT_HINT_THROTTLE_MS) {
    return;
  }

  const text = buildGroupRejectHint(params.reason, params.names);
  try {
    await params.client.sendMessage(params.chatId, text, {
      replyMessageId: params.replyMessageId,
    });
    lastRejectHintAtByChat.set(key, now);
  } catch (err) {
    params.error(`sharecrm[${params.accountId}]: failed to send reject hint: ${String(err)}`);
  }
}

function clearChatProgress(accountId: string, chatId?: string): void {
  if (chatId) {
    const key = progressKey(accountId, chatId);
    const current = progressByChat.get(key);
    if (current?.timer) clearTimeout(current.timer);
    progressByChat.delete(key);
    return;
  }

  for (const [key, current] of progressByChat.entries()) {
    if (!key.startsWith(`${accountId}:`)) continue;
    if (current.timer) clearTimeout(current.timer);
    progressByChat.delete(key);
  }
}

function markFormalReplyStarted(accountId: string, chatId: string): void {
  const current = progressByChat.get(progressKey(accountId, chatId));
  if (!current) return;
  current.formalStarted = true;
  if (current.timer) {
    clearTimeout(current.timer);
    current.timer = undefined;
  }
}

function nextProgressDelayMs(state: ChatProgressState): number | undefined {
  if (state.round >= state.maxTimes) return undefined;
  const nextOffset = state.scheduleMs?.length
    ? progressOffsetMs(state.round, state.scheduleMs, state.intervalMs)
    : state.round === 0
      ? state.delayMs
      : state.delayMs + state.round * state.intervalMs;
  const waitMs = nextOffset - (Date.now() - state.startedAt);
  return Math.max(0, waitMs);
}

function scheduleProgressTick(accountId: string, chatId: string, client: ShareCrmClient, error: (message: string) => void): void {
  const key = progressKey(accountId, chatId);
  const current = progressByChat.get(key);
  if (!current || current.formalStarted || current.round >= current.maxTimes) {
    return;
  }

  const delayMs = nextProgressDelayMs(current);
  if (delayMs == null) return;

  current.timer = setTimeout(async () => {
    const state = progressByChat.get(key);
    if (!state || state.formalStarted || state.round >= state.maxTimes) {
      return;
    }

    state.round += 1;
    const text = renderStatusMessage(pickMessage(state.messages), {
      elapsedMs: Date.now() - state.startedAt,
      round: state.round,
      max: state.maxTimes,
      name: state.senderName,
      bot: state.botName,
    });
    if (text) {
      try {
        await client.sendMessage(chatId, text);
      } catch (err) {
        error(`sharecrm[${accountId}]: failed to send progress: ${String(err)}`);
      }
    }

    if (!state.formalStarted && state.round < state.maxTimes) {
      scheduleProgressTick(accountId, chatId, client, error);
    }
  }, delayMs);
}

function startChatProgress(params: {
  accountId: string;
  chatId: string;
  client: ShareCrmClient;
  settings: ReturnType<typeof resolveProgressSettings>;
  senderName: string;
  botName: string;
  error: (message: string) => void;
}): void {
  const key = progressKey(params.accountId, params.chatId);
  const existing = progressByChat.get(key);
  if (existing && !existing.formalStarted) {
    return;
  }
  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const next: ChatProgressState = {
    startedAt: Date.now(),
    round: 0,
    maxTimes: params.settings.maxTimes,
    delayMs: params.settings.delayMs,
    intervalMs: params.settings.intervalMs,
    scheduleMs: params.settings.scheduleMs,
    messages: params.settings.messages,
    senderName: params.senderName,
    botName: params.botName,
    formalStarted: false,
  };
  progressByChat.set(key, next);
  scheduleProgressTick(params.accountId, params.chatId, params.client, params.error);
}

export function isAccountConnected(accountId: string): boolean {
  return activeClients.get(accountId)?.connected ?? false;
}

function getInboundText(data: (ShareCrmSseEvent & { type: "message" })["data"]): string {
  return data.message?.content?.trim() || data.text || "";
}

export function formatInboundImages(data: (ShareCrmSseEvent & { type: "message" })["data"]): string {
  const images = data.message?.images ?? [];
  const lines: string[] = [];
  for (const image of images) {
    const name = image?.filename?.trim() || "image";
    if (image?.url?.trim() || image?.filename?.trim()) {
      lines.push(`![${name}]`);
    }
  }
  return lines.join("\n");
}

function getInboundTimestampSeconds(data: (ShareCrmSseEvent & { type: "message" })["data"]): number {
  return data.timestamp ?? data.date ?? Math.floor(Date.now() / 1000);
}

function uniqueMentionTokens(values: unknown[]): string[] {
  const tokens: string[] = [];
  for (const value of values) {
    const token = String(value ?? "").trim();
    if (!token) continue;
    if (tokens.some((entry) => entry.toLowerCase() === token.toLowerCase())) continue;
    tokens.push(token);
  }
  return tokens;
}

function escapeMentionToken(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectMentionCandidates(botFullId?: string, extraAliases?: unknown[]): {
  ids: string[];
  names: string[];
} {
  const ids = uniqueMentionTokens([
    botFullId,
    botFullId?.trim().split(".").pop(),
  ]);
  const names = uniqueMentionTokens(extraAliases ?? []).filter(
    (alias) => !ids.some((id) => id.toLowerCase() === alias.toLowerCase()),
  );
  return { ids, names };
}

function stripLeadingCandidate(text: string, candidate: string, requireAt: boolean): string | null {
  const escaped = escapeMentionToken(candidate);
  const regex = new RegExp(`^${requireAt ? "@" : "@?"}${escaped}[,:：，\\s-]*`, "i");
  if (!regex.test(text)) return null;
  return text.replace(regex, "").trim();
}

function hasInlineMention(text: string, candidate: string): boolean {
  const escaped = escapeMentionToken(candidate);
  return new RegExp(`@${escaped}(?=$|[,:：，\\s]|[^\\s\\w])`, "i").test(text);
}

export function stripLeadingMention(
  text: string,
  botFullId?: string,
  extraAliases?: unknown[],
): { text: string; matched: boolean } {
  const normalized = text.trim();
  if (!normalized) {
    return { text: normalized, matched: false };
  }

  const { ids, names } = collectMentionCandidates(botFullId, extraAliases);
  if (ids.length === 0 && names.length === 0) {
    return { text: normalized, matched: false };
  }

  for (const id of ids) {
    const stripped = stripLeadingCandidate(normalized, id, false);
    if (stripped !== null) {
      return { text: stripped, matched: true };
    }
  }

  for (const name of names) {
    const stripped = stripLeadingCandidate(normalized, name, true);
    if (stripped !== null) {
      return { text: stripped, matched: true };
    }
  }

  if ([...ids, ...names].some((candidate) => hasInlineMention(normalized, candidate))) {
    return { text: normalized, matched: true };
  }

  return { text: normalized, matched: false };
}

function normalizeGatewayHistoryTimestamp(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function buildGatewayHistoryBody(entry: ShareCrmGatewayHistoryMessage): string {
  const metadataLines: string[] = [];
  const messageId = entry.message_id?.trim();
  const messageType = entry.message_type?.trim();
  const content = entry.content?.trim() ?? "";

  if (messageId) metadataLines.push(`[message_id: ${messageId}]`);
  if (messageType && messageType.toLowerCase() !== "t" && messageType.toLowerCase() !== "text") {
    metadataLines.push(`[message_type: ${messageType}]`);
  }

  return metadataLines.length > 0 ? `${metadataLines.join("\n")}\n${content}`.trim() : content;
}

export function normalizeGatewayHistoryEntries(params: {
  historyMessages?: ShareCrmGatewayHistoryMessage[];
  currentMessageId?: string;
}): HistoryEntry[] {
  const currentMessageId = params.currentMessageId?.trim();
  return (params.historyMessages ?? [])
    .filter(Boolean)
    .filter((entry) => {
      const messageId = entry.message_id?.trim();
      return !currentMessageId || !messageId || messageId !== currentMessageId;
    })
    .map((entry) => ({
      sender: entry.full_sender_id?.trim() || entry.sender_id?.trim() || "unknown",
      body: buildGatewayHistoryBody(entry),
      timestamp: normalizeGatewayHistoryTimestamp(entry.message_timestamp),
      messageId: entry.message_id?.trim() || undefined,
    }))
    .filter((entry) => entry.body.trim())
    .sort((a, b) => {
      const left = typeof a.timestamp === "number" ? a.timestamp : 0;
      const right = typeof b.timestamp === "number" ? b.timestamp : 0;
      return left - right;
    });
}

export function rememberDirectChatId(accountId: string, userId: string, chatId: string): Promise<void> {
  if (!accountId || !userId || !chatId) return Promise.resolve();
  const normalizedUserId = userId.trim();
  const normalizedChatId = chatId.trim();
  if (!normalizedUserId || !normalizedChatId) return Promise.resolve();

  const accountMap =
    directChatByUserByAccount.get(accountId) ??
    (() => {
      const next = new Map<string, string>();
      directChatByUserByAccount.set(accountId, next);
      return next;
    })();

  accountMap.set(normalizedUserId, normalizedChatId);

  return persistDirectChatBindings(accountId, accountMap).catch((error) => {
    const runtime = tryGetShareCrmRuntime();
    runtime?.logging?.getChildLogger?.({ channel: CHANNEL_ID, accountId }).warn(
      `sharecrm: failed to persist direct chat bindings: ${String(error)}`,
    );
  });
}

async function hydrateDirectChatBindings(accountId: string, runtime?: RuntimeEnv): Promise<void> {
  try {
    const bindings = await loadDirectChatBindings(accountId);
    directChatByUserByAccount.set(accountId, bindings);
    if (bindings.size > 0) {
      logShareCrm(runtime, "info", `sharecrm[${accountId}]: loaded ${bindings.size} userId->chatId bindings`);
    }
  } catch (error) {
    logShareCrm(runtime, "error", `sharecrm[${accountId}]: failed to load userId->chatId bindings: ${String(error)}`);
  }
}

export function resolveDirectChatIdForUser(accountId: string, userId: string): string | undefined {
  const normalizedUserId = userId?.trim();
  if (!accountId || !normalizedUserId) return undefined;
  return directChatByUserByAccount.get(accountId)?.get(normalizedUserId);
}

export function resolveDirectChatTargetForUser(
  userId: string,
  preferredAccountId?: string,
): { accountId: string; chatId: string } | null {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return null;

  if (preferredAccountId) {
    const preferredChatId = resolveDirectChatIdForUser(preferredAccountId, normalizedUserId);
    if (preferredChatId) {
      return { accountId: preferredAccountId, chatId: preferredChatId };
    }
  }

  let matched: { accountId: string; chatId: string } | null = null;
  for (const [accountId, accountMap] of directChatByUserByAccount.entries()) {
    const chatId = accountMap.get(normalizedUserId);
    if (!chatId) continue;

    if (!matched) {
      matched = { accountId, chatId };
      continue;
    }

    // 同一个 userId 命中多个账号，避免误发。
    if (matched.accountId !== accountId || matched.chatId !== chatId) {
      return null;
    }
  }

  return matched;
}

export type MonitorShareCrmOpts = {
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

/**
 * 处理来自 ShareCRM Gateway 的入站消息
 */
async function handleInboundMessage(params: {
  cfg: OpenClawConfig;
  account: ResolvedShareCrmAccount;
  event: ShareCrmSseEvent & { type: "message" };
  runtime?: RuntimeEnv;
  chatHistories: Map<string, HistoryEntry[]>;
  client: ShareCrmClient;
}): Promise<void> {
  const { cfg, account, event, runtime, chatHistories, client } = params;
  const log = (message: string) => logShareCrm(runtime, "info", message);
  const error = (message: string) => logShareCrm(runtime, "error", message);
  const core = getShareCrmRuntime();

  const { data } = event;
  const isGroup = data.chat_type === "group";
  const senderId = data.from.id;
  const senderName = data.from.name;
  const chatId = data.chat_id;
  const messageId = data.message_id;
  const caption = getInboundText(data);
  const imagePlaceholder = formatInboundImages(data);
  const rawText = [caption, imagePlaceholder].filter(Boolean).join("\n");
  const timestampSeconds = getInboundTimestampSeconds(data);
  const replyMessageId = data.reply_message_id;
  const messageType = data.message?.type ?? data.message_type ?? "text";
  const connectedBotInfo = getBotInfo(account.accountId);
  const botFullId = data.bot_full_id ?? connectedBotInfo?.botFullId;
  if (isSelfBotMessage({ senderId, botFullId })) {
    log(`sharecrm[${account.accountId}]: ignoring self-authored message from ${senderId}`);
    return;
  }
  const mentionResult = isGroup
    ? stripLeadingMention(caption || rawText, botFullId, account.config?.mentionAliases)
    : { text: caption, matched: true };

  log(`sharecrm[${account.accountId}]: received message from ${senderName} (${senderId}) in ${chatId} (${data.chat_type})`);

  // 记录私聊 userId -> chatId 映射，确保后续回复使用合法 chat_id。
  if (!isGroup) {
    await rememberDirectChatId(account.accountId, senderId, chatId);
  }

  // 私聊策略检查
  const channelCfg = account.config;
  const dmPolicy = channelCfg?.dmPolicy ?? DEFAULT_DM_POLICY;
  const configAllowFrom = normalizeAllowFrom(channelCfg?.allowFrom);
  const historyLimit = Math.max(
    0,
    channelCfg?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );

  if (!isGroup) {
    const pairing = createChannelPairingController({
      core,
      channel: CHANNEL_ID,
      accountId: account.accountId,
    });

    const storeAllowFrom =
      dmPolicy !== "allowlist" && dmPolicy !== "open"
        ? await pairing.readAllowFromStore().catch(() => [])
        : [];
    const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
    const dmAllowed = isDirectMessageAuthorized({
      dmPolicy,
      senderId,
      allowFrom: effectiveAllowFrom,
    });

    if (!dmAllowed) {
      if (dmPolicy === "pairing") {
        const { code, created } = await pairing.upsertPairingRequest({
          id: senderId,
          meta: { name: senderName, chat_id: chatId },
        });
        if (created) {
          log(`sharecrm[${account.accountId}]: pairing request from ${senderId}`);
          const pairingReply = core.channel.pairing.buildPairingReply({
            channel: CHANNEL_ID,
            idLine: `Your ShareCRM user ID: ${senderId}`,
            code,
          });
          await client.sendMessage(chatId, pairingReply);
        }
        return;
      }
      if (dmPolicy === "disabled") {
        log(`sharecrm[${account.accountId}]: DMs disabled, ignoring ${senderId}`);
        return;
      }
      log(`sharecrm[${account.accountId}]: blocked unauthorized sender ${senderId} (dmPolicy=${dmPolicy})`);
      return;
    }
  }

  // 群聊策略检查
  if (isGroup) {
    const groupPolicy = channelCfg?.groupPolicy ?? DEFAULT_GROUP_POLICY;
    const groupAllowFrom = normalizeAllowFrom(channelCfg?.groupAllowFrom);
    const requireMention = channelCfg?.requireMention ?? DEFAULT_REQUIRE_MENTION;

    if (groupPolicy === "disabled") {
      log(`sharecrm[${account.accountId}]: groups disabled, ignoring ${chatId}`);
      if (looksLikeBotAddress(rawText, mentionResult.matched)) {
        await sendGroupRejectHint({
          accountId: account.accountId,
          chatId,
          client,
          reason: "disabled",
          replyMessageId,
          error,
        });
      }
      return;
    }
    if (groupPolicy === "allowlist") {
      const groupAllowed =
        groupAllowFrom.includes(chatId) || groupAllowFrom.includes("*");
      if (!groupAllowed) {
        log(`sharecrm[${account.accountId}]: group ${chatId} is not allowlisted`);
        if (looksLikeBotAddress(rawText, mentionResult.matched)) {
          await sendGroupRejectHint({
            accountId: account.accountId,
            chatId,
            client,
            reason: "notAllowlisted",
            replyMessageId,
            error,
          });
        }
        return;
      }
    }
    if (requireMention && !mentionResult.matched) {
      recordPendingHistoryEntryIfEnabled({
        historyMap: chatHistories,
        historyKey: chatId,
        limit: historyLimit,
        entry: {
          sender: senderName || senderId,
          body: rawText,
          timestamp: timestampSeconds * 1000,
          messageId,
        },
      });
      log(`sharecrm[${account.accountId}]: group message missing mention, ignoring ${chatId}`);
      const unmatchedNames = extractAtMentionNames(rawText);
      if (unmatchedNames.length > 0) {
        await sendGroupRejectHint({
          accountId: account.accountId,
          chatId,
          client,
          reason: "missingMention",
          names: unmatchedNames,
          replyMessageId,
          error,
        });
      }
      return;
    }
  }

  const stagedImages = await stageInboundImages({
    images: data.message?.images,
    accountId: account.accountId,
    messageId,
  });
  if (stagedImages.failed > 0) {
    log(`sharecrm[${account.accountId}]: failed to stage ${stagedImages.failed} inbound image(s)`);
  }
  const imageMarkdown = stagedImages.markdown;
  const text = [mentionResult.text, imageMarkdown].filter(Boolean).join("\n") || rawText;

  const ackSettings = resolveAckSettings(channelCfg, isGroup);
  const progressSettings = resolveProgressSettings(channelCfg, isGroup);
  const botName = (botFullId?.split(".").pop() ?? botFullId ?? "ShareCRM").trim();
  const now = Date.now();
  const lastAckAt = lastAckAtByChat.get(progressKey(account.accountId, chatId)) ?? 0;
  const shouldAck =
    ackSettings.enabled &&
    !isLikelyCommandText(text) &&
    now - lastAckAt >= ACK_THROTTLE_MS;

  if (shouldAck) {
    const ackText = renderStatusMessage(pickMessage(ackSettings.messages), {
      name: senderName || senderId,
      bot: botName,
    });
    if (ackText) {
      try {
        await client.sendMessage(chatId, ackText);
        lastAckAtByChat.set(progressKey(account.accountId, chatId), now);
      } catch (err) {
        error(`sharecrm[${account.accountId}]: failed to send ack: ${String(err)}`);
      }
    }
  }

  if (progressSettings.enabled && !isLikelyCommandText(text)) {
    startChatProgress({
      accountId: account.accountId,
      chatId,
      client,
      settings: progressSettings,
      senderName: senderName || senderId,
      botName,
      error,
    });
  }

  // 会话路由
  const peerId = isGroup ? chatId : senderId;
  const from = `sharecrm:${senderId}`;
  const to = `chat:${chatId}`;

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "direct",
      id: peerId,
    },
  });
  // Keep direct-chat sessions isolated by chat_id so the same user's
  // concurrent DM windows do not collapse into one session.
  const effectiveSessionKey = isGroup ? route.sessionKey : `${route.sessionKey}:chat:${chatId}`;

  // 构建 Agent 消息体
  const speaker = senderName || senderId;
  const metadataLines = [`[message_id: ${messageId}]`];
  if (messageType && messageType !== "text") {
    metadataLines.push(`[message_type: ${messageType}]`);
  }
  if (replyMessageId != null) {
    metadataLines.push(`[reply_to_message_id: ${replyMessageId}]`);
  }
  let messageBody = `${metadataLines.join("\n")}\n${speaker}: ${text}`;

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "ShareCRM",
    from: isGroup ? `${chatId}:${senderId}` : senderId,
    timestamp: new Date(timestampSeconds * 1000),
    envelope: envelopeOptions,
    body: messageBody,
  });

  let combinedBody = body;
  const historyKey = isGroup ? chatId : undefined;
  const gatewayHistoryEntries = isGroup
    ? normalizeGatewayHistoryEntries({
        historyMessages: data.history_messages,
        currentMessageId: messageId,
      })
    : [];
  const localHistoryEntries = isGroup && historyKey && chatHistories ? (chatHistories.get(historyKey) ?? []) : [];
  const effectiveHistoryEntries = gatewayHistoryEntries.length > 0 ? gatewayHistoryEntries : localHistoryEntries;

  // 如果是群聊，附加历史消息上下文
  if (isGroup && historyKey && effectiveHistoryEntries.length > 0) {
    const historyMap =
      gatewayHistoryEntries.length > 0
        ? new Map<string, HistoryEntry[]>([[historyKey, gatewayHistoryEntries]])
        : chatHistories;
    combinedBody = buildPendingHistoryContextFromMap({
      historyMap,
      historyKey,
      limit: historyLimit,
      currentMessage: combinedBody,
      formatEntry: (entry) =>
        core.channel.reply.formatAgentEnvelope({
          channel: "ShareCRM",
          from: `${chatId}:${entry.sender}`,
          timestamp: entry.timestamp,
          body: entry.body,
          envelope: envelopeOptions,
        }),
    });
  }

  const inboundHistory =
    isGroup && historyLimit > 0
      ? effectiveHistoryEntries.map((entry) => ({
          sender: entry.sender,
          body: entry.body,
          timestamp: entry.timestamp,
        }))
      : undefined;

  // 入队系统事件
  const preview = text.replace(/\s+/g, " ").slice(0, 160);
  const inboundLabel = isGroup
    ? `ShareCRM[${account.accountId}] message in group ${chatId}`
    : `ShareCRM[${account.accountId}] DM from ${senderId}`;
  core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
    sessionKey: effectiveSessionKey,
    contextKey: `sharecrm:message:${chatId}:${messageId}`,
  });

  // 构建上下文载荷
  const firstImage = stagedImages.staged[0];
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: combinedBody,
    BodyForAgent: messageBody,
    InboundHistory: inboundHistory,
    RawBody: text,
    CommandBody: text,
    From: from,
    To: to,
    SessionKey: effectiveSessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    GroupSubject: isGroup ? chatId : undefined,
    SenderName: senderName || senderId,
    SenderId: senderId,
    Provider: CHANNEL_ID as any,
    Surface: CHANNEL_ID as any,
    MessageSid: messageId,
    Timestamp: timestampSeconds * 1000,
    WasMentioned: isGroup ? mentionResult.matched : undefined,
    OriginatingChannel: CHANNEL_ID as any,
    OriginatingTo: to,
    ...(firstImage
      ? {
          MediaPath: firstImage.path,
          MediaUrl: firstImage.path,
          MediaType: firstImage.contentType,
          MediaPaths: stagedImages.staged.map((image) => image.path),
          MediaUrls: stagedImages.staged.map((image) => image.path),
          MediaTypes: stagedImages.staged.map((image) => image.contentType),
        }
      : {}),
  });

  // 构建回复分发器
  const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, CHANNEL_ID, account.accountId, {
    fallbackLimit: 4000,
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
      deliver: async (payload: ReplyPayload) => {
        const replyText = payload.text ?? "";
        if (!replyText.trim()) return;

        markFormalReplyStarted(account.accountId, chatId);

        // Chunk and send
        for (const chunk of core.channel.text.chunkMarkdownText(replyText, textChunkLimit)) {
          await client.sendMessage(chatId, chunk, {
            replyMessageId,
          });
        }
      },
      onError: async (err) => {
        error(`sharecrm[${account.accountId}] reply failed: ${String(err)}`);
      },
      onIdle: async () => {},
      onCleanup: () => {},
    });

  log(`sharecrm[${account.accountId}]: dispatching to agent (session=${effectiveSessionKey})`);

  const { queuedFinal, counts } = await core.channel.reply.withReplyDispatcher({
    dispatcher,
    onSettled: () => {
      markDispatchIdle();
    },
    run: () =>
      core.channel.reply.dispatchReplyFromConfig({
        ctx: ctxPayload,
        cfg,
        dispatcher,
        replyOptions: {
          ...replyOptions,
        },
      }),
  });

  // 分发完成后清理群聊历史
  if (isGroup && historyKey && chatHistories) {
    clearHistoryEntriesIfEnabled({
      historyMap: chatHistories,
      historyKey,
      limit: historyLimit,
    });
  }

  markFormalReplyStarted(account.accountId, chatId);
  log(`sharecrm[${account.accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
}

/**
 * 监控单个 ShareCRM 账号
 */
async function monitorSingleAccount(params: {
  cfg: OpenClawConfig;
  account: ResolvedShareCrmAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { cfg, account, runtime, abortSignal } = params;
  const { accountId } = account;
  const log = (message: string) => logShareCrm(runtime, "info", message);
  const error = (message: string) => logShareCrm(runtime, "error", message);

  const chatHistories = new Map<string, HistoryEntry[]>();
  const inboundQueues = new Map<string, Promise<void>>();

  const enqueueInbound = (event: ShareCrmSseEvent & { type: "message" }, client: ShareCrmClient) => {
    const laneKey = event.data.chat_id || event.data.message_id || "unknown";
    const previous = inboundQueues.get(laneKey) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() =>
        handleInboundMessage({
          cfg,
          account,
          event,
          runtime,
          chatHistories,
          client,
        }),
      )
      .catch((err) => {
        error(`sharecrm[${accountId}]: failed to handle inbound message: ${String(err)}`);
      });

    inboundQueues.set(laneKey, current);
    current.finally(() => {
      if (inboundQueues.get(laneKey) === current) {
        inboundQueues.delete(laneKey);
      }
    });
  };

  await hydrateDirectChatBindings(accountId, runtime);
  const lastEventId = await loadLastEventId(accountId).catch((error) => {
    error(`sharecrm[${accountId}]: failed to load last event id: ${String(error)}`);
    return null;
  });

  return new Promise<void>((resolve) => {
    const client = new ShareCrmClient({
      account,
      lastEventId,
      onConnected: (info) => {
        botInfo.set(accountId, info);
        log(
          `sharecrm[${accountId}]: connected bot ${info.botFullId} (protocol=${info.protocolVersion ?? "unknown"}, client=${info.clientVersion ?? "unknown"}, maxLifetime=${info.maxLifetime ?? 0})`,
        );
      },
      onMessage: (event) => {
        enqueueInbound(event, client);
      },
      onDisconnected: (reason) => {
        botInfo.delete(accountId);
        log(`sharecrm[${accountId}]: disconnected: ${reason}`);
      },
      onError: (err) => {
        error(`sharecrm[${accountId}]: connection error: ${String(err)}`);
      },
      onLastEventId: (eventId) => {
        persistLastEventId(accountId, eventId).catch((persistError) => {
          error(`sharecrm[${accountId}]: failed to persist last event id: ${String(persistError)}`);
        });
      },
      log,
    });

    activeClients.set(accountId, client);

    const handleAbort = () => {
      log(`sharecrm[${accountId}]: abort received, stopping`);
      client.disconnect();
      activeClients.delete(accountId);
      botInfo.delete(accountId);
      directChatByUserByAccount.delete(accountId);
      inboundQueues.clear();
      clearChatProgress(accountId);
      resolve();
    };

    if (abortSignal?.aborted) {
      handleAbort();
      return;
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    client.connect();
  });
}

/**
 * 主入口：启动所有已启用账号（或指定账号）的监控
 */
export async function monitorShareCrmProvider(opts: MonitorShareCrmOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("ShareCRM 监控需要配置参数");
  }

  const log = (message: string) => logShareCrm(opts.runtime, "info", message);

  // 如果指定了 accountId，则只监控该账号
  if (opts.accountId) {
    const account = resolveAccount(cfg, opts.accountId);
    if (!account.enabled || !account.configured) {
      throw new Error(`ShareCRM account "${opts.accountId}" is not configured or disabled`);
    }
    return monitorSingleAccount({
      cfg,
      account,
      runtime: opts.runtime,
      abortSignal: opts.abortSignal,
    });
  }

  // 否则，启动所有已启用的账号
  const accounts = listEnabledAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error("No enabled ShareCRM accounts found");
  }

  log(`sharecrm: starting ${accounts.length} accounts: ${accounts.map((a) => a.accountId).join(", ")}`);

  await Promise.all(
    accounts.map((account) =>
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
      }),
    ),
  );
}

/**
 * 获取用于发送消息的活跃客户端
 */
export function getActiveClient(accountId: string): ShareCrmClient | undefined {
  return activeClients.get(accountId);
}

/**
 * 获取账号的 Bot 信息
 */
export function getBotInfo(accountId: string): { botFullId: string; version?: string; maxLifetime?: number } | undefined {
  return botInfo.get(accountId);
}

/**
 * 停止指定账号或所有账号的监控
 */
export function stopShareCrmMonitor(accountId?: string): void {
  if (accountId) {
    const client = activeClients.get(accountId);
    if (client) {
      client.disconnect();
      activeClients.delete(accountId);
    }
    botInfo.delete(accountId);
    directChatByUserByAccount.delete(accountId);
    clearChatProgress(accountId);
    for (const key of [...lastRejectHintAtByChat.keys()]) {
      if (key.startsWith(`${accountId}:`)) lastRejectHintAtByChat.delete(key);
    }
  } else {
    for (const client of activeClients.values()) {
      client.disconnect();
    }
    activeClients.clear();
    botInfo.clear();
    directChatByUserByAccount.clear();
    for (const accountKey of [...progressByChat.keys()]) {
      const current = progressByChat.get(accountKey);
      if (current?.timer) clearTimeout(current.timer);
    }
    progressByChat.clear();
    lastAckAtByChat.clear();
    lastRejectHintAtByChat.clear();
  }
}
