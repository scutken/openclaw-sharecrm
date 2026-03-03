/**
 * ShareCRM Gateway 监控器
 *
 * 管理与 ShareCRM IM Gateway 的 WebSocket 连接，
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
import type { ResolvedShareCrmAccount, ShareCrmServerMessage } from "./types.js";

const CHANNEL_ID = "sharecrm";

// 各账号的活跃客户端
const activeClients = new Map<string, ShareCrmClient>();
// 各账号的 Bot 信息
const botInfo = new Map<string, { botId: string; botName: string }>();

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
  event: ShareCrmServerMessage & { type: "message" };
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
  const text = data.text;

  log(`sharecrm[${account.accountId}]: 收到消息来自 ${senderName} (${senderId})，会话 ${chatId} (${data.chat_type})`);

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
          meta: { name: senderName },
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
  }

  // 群聊历史消息处理
  const historyLimit = Math.max(
    0,
    channelCfg?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );

  // 会话路由
  const peerId = isGroup ? chatId : senderId;
  const from = `sharecrm:${senderId}`;
  const to = isGroup ? `chat:${chatId}` : `user:${senderId}`;

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: isGroup ? "group" : "direct",
      id: peerId,
    },
  });

  // 构建 Agent 消息体
  const speaker = senderName || senderId;
  let messageBody = `[message_id: ${messageId}]\n${speaker}: ${text}`;

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "ShareCRM",
    from: isGroup ? `${chatId}:${senderId}` : senderId,
    timestamp: new Date(data.date * 1000),
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
    sessionKey: route.sessionKey,
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
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    GroupSubject: isGroup ? chatId : undefined,
    SenderName: senderName || senderId,
    SenderId: senderId,
    Provider: CHANNEL_ID as any,
    Surface: CHANNEL_ID as any,
    MessageSid: messageId,
    Timestamp: data.date * 1000,
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

  log(`sharecrm[${account.accountId}]: 正在分发给 Agent (session=${route.sessionKey})`);

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

  return new Promise<void>((resolve) => {
    const client = new ShareCrmClient({
      account,
      onConnected: (botId, botName) => {
        botInfo.set(accountId, { botId, botName });
        log(`sharecrm[${accountId}]: 已连接为 ${botName} (${botId})`);
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
export function getBotInfo(accountId: string): { botId: string; botName: string } | undefined {
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
  } else {
    for (const client of activeClients.values()) {
      client.disconnect();
    }
    activeClients.clear();
    botInfo.clear();
  }
}
