/**
 * ShareCRM Gateway 监控器
 *
 * 管理与 ShareCRM IM Gateway 的 SSE 连接，
 * 分发入站消息给 Agent，处理回复
 */

import type {
  OpenClawConfig,
  RuntimeEnv,
  HistoryEntry,
  ReplyPayload,
} from "openclaw/plugin-sdk";
import {
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  createScopedPairingAccess,
  DEFAULT_GROUP_HISTORY_LIMIT,
  recordPendingHistoryEntryIfEnabled,
  createReplyPrefixContext,
  createTypingCallbacks,
  PAIRING_APPROVED_MESSAGE,
} from "openclaw/plugin-sdk";
import { resolveAccount, listEnabledAccounts } from "./accounts.js";
import { ShareCrmClient } from "./client.js";
import { getShareCrmRuntime } from "./runtime.js";
import { loadDirectChatBindings, persistDirectChatBindings } from "./state.js";
import type { ResolvedShareCrmAccount, ShareCrmSseEvent } from "./types.js";

const CHANNEL_ID = "sharecrm";

// 各账号的活跃客户端
const activeClients = new Map<string, ShareCrmClient>();
// 各账号的 Bot 信息
const botInfo = new Map<string, { botFullId: string; version?: string; maxLifetime?: number }>();
// Direct 消息会话映射: accountId -> (userId -> chatId)
const directChatByUserByAccount = new Map<string, Map<string, string>>();

export function isAccountConnected(accountId: string): boolean {
  return activeClients.get(accountId)?.connected ?? false;
}

function getInboundText(data: (ShareCrmSseEvent & { type: "message" })["data"]): string {
  return data.message?.content?.trim() || data.text || "";
}

function getInboundTimestampSeconds(data: (ShareCrmSseEvent & { type: "message" })["data"]): number {
  return data.timestamp ?? data.date ?? Math.floor(Date.now() / 1000);
}

export function stripLeadingMention(text: string, botFullId?: string): { text: string; matched: boolean } {
  const normalized = text.trim();
  if (!normalized) {
    return { text: normalized, matched: false };
  }
  if (!botFullId) {
    return { text: normalized, matched: false };
  }

  const botId = botFullId.trim();
  const shortId = botId.split(".").pop() ?? botId;
  const candidates = [botId, shortId].filter(Boolean);

  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^@?${escaped}[,:：，\\s-]*`, "i");
    if (regex.test(normalized)) {
      return {
        text: normalized.replace(regex, "").trim(),
        matched: true,
      };
    }
  }

  return { text: normalized, matched: false };
}

function rememberDirectChatId(accountId: string, userId: string, chatId: string): void {
  if (!accountId || !userId || !chatId) return;
  const normalizedUserId = userId.trim();
  const normalizedChatId = chatId.trim();
  if (!normalizedUserId || !normalizedChatId) return;

  const accountMap =
    directChatByUserByAccount.get(accountId) ??
    (() => {
      const next = new Map<string, string>();
      directChatByUserByAccount.set(accountId, next);
      return next;
    })();

  accountMap.set(normalizedUserId, normalizedChatId);

  persistDirectChatBindings(accountId, accountMap).catch((error) => {
    const runtime = getShareCrmRuntime();
    runtime.logging.getChildLogger({ channel: CHANNEL_ID, accountId }).warn(
      `sharecrm: failed to persist direct chat bindings: ${String(error)}`,
    );
  });
}

async function hydrateDirectChatBindings(accountId: string, runtime?: RuntimeEnv): Promise<void> {
  try {
    const bindings = await loadDirectChatBindings(accountId);
    directChatByUserByAccount.set(accountId, bindings);
    if (bindings.size > 0) {
      (runtime?.log ?? console.log)(`sharecrm[${accountId}]: 已加载 ${bindings.size} 条 userId->chatId 缓存`);
    }
  } catch (error) {
    (runtime?.error ?? console.error)(`sharecrm[${accountId}]: 加载 userId->chatId 缓存失败: ${String(error)}`);
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
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;
  const core = getShareCrmRuntime();

  const { data } = event;
  const isGroup = data.chat_type === "group";
  const senderId = data.from.id;
  const senderName = data.from.name;
  const chatId = data.chat_id;
  const messageId = data.message_id;
  const rawText = getInboundText(data);
  const timestampSeconds = getInboundTimestampSeconds(data);
  const replyMessageId = data.reply_message_id;
  const messageType = data.message?.type ?? data.message_type ?? "text";
  const connectedBotInfo = getBotInfo(account.accountId);
  const mentionResult = isGroup
    ? stripLeadingMention(rawText, data.bot_full_id ?? connectedBotInfo?.botFullId)
    : { text: rawText, matched: true };
  const text = mentionResult.text || rawText;

  log(`sharecrm[${account.accountId}]: 收到消息来自 ${senderName} (${senderId})，会话 ${chatId} (${data.chat_type})`);

  // 记录私聊 userId -> chatId 映射，确保后续回复使用合法 chat_id。
  if (!isGroup) {
    rememberDirectChatId(account.accountId, senderId, chatId);
  }

  // 私聊策略检查
  const channelCfg = account.config;
  const dmPolicy = channelCfg?.dmPolicy ?? "open";
  const configAllowFrom = (channelCfg?.allowFrom ?? []).map(String);

  if (!isGroup) {
    const pairing = createScopedPairingAccess({
      core,
      channel: CHANNEL_ID,
      accountId: account.accountId,
    });

    const storeAllowFrom =
      dmPolicy !== "allowlist" && dmPolicy !== "open"
        ? await pairing.readAllowFromStore().catch(() => [])
        : [];
    const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
    const dmAllowed =
      dmPolicy === "open" ||
      effectiveAllowFrom.some(
        (entry) => entry === "*" || entry === senderId || entry.toLowerCase() === senderName?.toLowerCase(),
      );

    if (!dmAllowed) {
      if (dmPolicy === "pairing") {
        const { code, created } = await pairing.upsertPairingRequest({
          id: senderId,
          meta: { name: senderName, chat_id: chatId },
        });
        if (created) {
          log(`sharecrm[${account.accountId}]: 收到来自 ${senderId} 的配对请求`);
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
        log(`sharecrm[${account.accountId}]: 私聊已禁用，忽略 ${senderId}`);
        return;
      }
      log(`sharecrm[${account.accountId}]: 拦截未授权用户 ${senderId} (dmPolicy=${dmPolicy})`);
      return;
    }
  }

  // 群聊策略检查
  if (isGroup) {
    const groupPolicy = channelCfg?.groupPolicy ?? "disabled";
    const groupAllowFrom = (channelCfg?.groupAllowFrom ?? []).map(String);
    const requireMention = channelCfg?.requireMention ?? false;

    if (groupPolicy === "disabled") {
      log(`sharecrm[${account.accountId}]: 群聊已禁用，忽略 ${chatId}`);
      return;
    }
    if (groupPolicy === "allowlist") {
      const groupAllowed =
        groupAllowFrom.includes(chatId) || groupAllowFrom.includes("*");
      if (!groupAllowed) {
        log(`sharecrm[${account.accountId}]: 群 ${chatId} 不在白名单中`);
        return;
      }
    }
    if (requireMention && !mentionResult.matched) {
      log(`sharecrm[${account.accountId}]: 群消息未命中 mention，忽略 ${chatId}`);
      return;
    }
  }

  // 群聊历史消息处理
  const historyLimit = Math.max(
    0,
    channelCfg?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );

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

  // 如果是群聊，附加历史消息上下文
  if (isGroup && historyKey && chatHistories) {
    combinedBody = buildPendingHistoryContextFromMap({
      historyMap: chatHistories,
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
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: combinedBody,
    BodyForAgent: messageBody,
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
    OriginatingChannel: CHANNEL_ID as any,
    OriginatingTo: to,
  });

  // 构建回复分发器
  const prefixContext = createReplyPrefixContext({ cfg, agentId: route.agentId });
  const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, CHANNEL_ID, account.accountId, {
    fallbackLimit: 4000,
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
      deliver: async (payload: ReplyPayload) => {
        const replyText = payload.text ?? "";
        if (!replyText.trim()) return;

        // Chunk and send
        for (const chunk of core.channel.text.chunkMarkdownText(replyText, textChunkLimit)) {
          await client.sendMessage(chatId, chunk);
        }
      },
      onError: async (err) => {
        error(`sharecrm[${account.accountId}] 回复失败: ${String(err)}`);
      },
      onIdle: async () => {},
      onCleanup: () => {},
    });

  log(`sharecrm[${account.accountId}]: 正在分发给 Agent (session=${effectiveSessionKey})`);

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
          onModelSelected: prefixContext.onModelSelected,
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

  log(`sharecrm[${account.accountId}]: 分发完成 (queuedFinal=${queuedFinal}, replies=${counts.final})`);
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
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  const chatHistories = new Map<string, HistoryEntry[]>();

  await hydrateDirectChatBindings(accountId, runtime);

  return new Promise<void>((resolve) => {
    const client = new ShareCrmClient({
      account,
      onConnected: (info) => {
        botInfo.set(accountId, info);
        log(
          `sharecrm[${accountId}]: 已连接企信 Bot ${info.botFullId} (version=${info.version ?? "unknown"}, maxLifetime=${info.maxLifetime ?? 0})`,
        );
      },
      onMessage: (event) => {
        handleInboundMessage({
          cfg,
          account,
          event,
          runtime,
          chatHistories,
          client,
        }).catch((err) => {
          error(`sharecrm[${accountId}]: 处理消息时出错: ${String(err)}`);
        });
      },
      onDisconnected: (reason) => {
        botInfo.delete(accountId);
        log(`sharecrm[${accountId}]: 已断开连接: ${reason}`);
      },
      onError: (err) => {
        error(`sharecrm[${accountId}]: 连接错误: ${String(err)}`);
      },
      log,
    });

    activeClients.set(accountId, client);

    const handleAbort = () => {
      log(`sharecrm[${accountId}]: 收到终止信号，正在停止`);
      client.disconnect();
      activeClients.delete(accountId);
      botInfo.delete(accountId);
      directChatByUserByAccount.delete(accountId);
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

  const log = opts.runtime?.log ?? console.log;

  // 如果指定了 accountId，则只监控该账号
  if (opts.accountId) {
    const account = resolveAccount(cfg, opts.accountId);
    if (!account.enabled || !account.configured) {
      throw new Error(`ShareCRM 账号 "${opts.accountId}" 未配置或已禁用`);
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
    throw new Error("未找到已启用的 ShareCRM 账号配置");
  }

  log(`sharecrm: 正在启动 ${accounts.length} 个账号: ${accounts.map((a) => a.accountId).join(", ")}`);

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
  } else {
    for (const client of activeClients.values()) {
      client.disconnect();
    }
    activeClients.clear();
    botInfo.clear();
    directChatByUserByAccount.clear();
  }
}
