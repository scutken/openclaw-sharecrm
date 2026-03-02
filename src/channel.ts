/**
 * OpenClaw ShareCRM Plugin - Channel 插件入口
 * 简化版：纯 WebSocket 双向通信
 */

import { ShareCrmClient, type MessageEvent, type SendResult } from "./api.js";
import { ShareCrmConfigSchema, type ResolvedShareCrmAccount } from "./config-schema.js";
import { getShareCrmRuntime, setShareCrmRuntime, type PluginRuntime } from "./runtime.js";

// ============ 全局状态 ============

let client: ShareCrmClient | null = null;
let currentAccount: ResolvedShareCrmAccount | null = null;

// ============ Channel 定义 ============

const shareCrmChannel = {
  id: "sharecrm",

  meta: {
    id: "sharecrm",
    label: "ShareCRM",
    selectionLabel: "ShareCRM (内部 IM)",
    docsPath: "/channels/sharecrm",
    docsLabel: "sharecrm",
    blurb: "ShareCRM 内部 IM 渠道，通过 WebSocket 双向通信。",
    aliases: ["scrm"],
  },

  capabilities: {
    chatTypes: ["direct", "group"] as const,
    threads: false,
    reactions: false,
    media: false,
    edit: false,
    reply: true,
  },

  configSchema: ShareCrmConfigSchema,

  config: {
    listAccountIds: (cfg: Record<string, unknown>): string[] => {
      const channelCfg = (cfg.channels as Record<string, unknown>)?.sharecrm as Record<string, unknown>;
      return Object.keys(channelCfg?.accounts ?? { default: {} });
    },

    resolveAccount: (cfg: Record<string, unknown>, accountId?: string): ResolvedShareCrmAccount => {
      const id = accountId ?? "default";
      const channelCfg = (cfg.channels as Record<string, unknown>)?.sharecrm as Record<string, unknown>;
      const accountCfg = (channelCfg?.accounts as Record<string, Record<string, unknown>>)?.[id] ?? channelCfg;

      const gatewayUrl = (accountCfg?.gatewayUrl ?? channelCfg?.gatewayUrl) as string | undefined;
      const botToken = accountCfg?.botToken as string | undefined;

      const dmPolicy = (accountCfg?.dmPolicy as ResolvedShareCrmAccount["dmPolicy"]) ?? "open";
      let allowFrom = (accountCfg?.allowFrom as string[]) ?? [];
      
      // dmPolicy: "open" 时自动添加通配符
      if (dmPolicy === "open" && !allowFrom.includes("*")) {
        allowFrom = ["*", ...allowFrom];
      }

      return {
        accountId: id,
        enabled: (accountCfg?.enabled as boolean) ?? true,
        configured: !!(gatewayUrl && botToken),
        gatewayUrl: gatewayUrl ?? "",
        botToken: botToken ?? "",
        chatId: accountCfg?.chatId as string | undefined,
        dmPolicy,
        allowFrom,
      };
    },
  },

  outbound: {
    deliveryMode: "direct" as const,

    sendText: async (ctx: {
      text: string;
      channelId: string;
      accountId?: string;
      replyTo?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!client) {
        return { ok: false, error: "未连接" };
      }

      const runtime = getShareCrmRuntime();
      runtime?.logger?.info(`[ShareCRM] 发送消息: channelId=${ctx.channelId}`);

      const result = await client.sendMessage(ctx.channelId, ctx.text);
      return { ok: result.ok, error: result.error };
    },
  },

  gateway: {
    startAccount: async (
      params: {
        cfg: Record<string, unknown>;
        runtime: PluginRuntime;
        abortSignal: AbortSignal;
        accountId?: string;
      }
    ): Promise<void> => {
      const { cfg, runtime, abortSignal, accountId } = params;
      const logger = runtime?.logger ?? console;
      
      setShareCrmRuntime(runtime);

      const account = shareCrmChannel.config.resolveAccount(cfg, accountId);
      currentAccount = account;

      if (!account.enabled) {
        logger.info(`[ShareCRM] 账号 ${account.accountId} 未启用`);
        return;
      }

      if (!account.configured) {
        logger.warn(`[ShareCRM] 账号 ${account.accountId} 配置不完整，需要 gatewayUrl 和 botToken`);
        return;
      }

      // 创建客户端
      client = new ShareCrmClient({
        gatewayUrl: account.gatewayUrl,
        botToken: account.botToken,
        logger: logger,

        onMessage: (event) => {
          handleInboundMessage(event, account, cfg);
        },

        onConnected: (info) => {
          logger.info(`[ShareCRM] 已连接: ${info.result?.bot_name ?? "Bot"}`);
        },

        onDisconnected: (reason) => {
          logger.warn(`[ShareCRM] 连接断开: ${reason}，3秒后重连`);
          if (!abortSignal.aborted) {
            setTimeout(() => client?.connect(), 3000);
          }
        },

        onError: (error) => {
          logger.error(`[ShareCRM] 错误: ${error.message}`);
        },
      });

      // 建立连接
      client.connect();

      // 处理中止信号
      abortSignal.addEventListener("abort", () => {
        logger.info(`[ShareCRM] 收到中止信号，断开连接`);
        client?.disconnect();
        client = null;
        currentAccount = null;
      });
    },

    stopAccount: (accountId?: string): void => {
      client?.disconnect();
      client = null;
      currentAccount = null;
    },
  },
};

// ============ 入站消息处理 ============

/**
 * 处理入站消息
 */
async function handleInboundMessage(
  event: MessageEvent,
  account: ResolvedShareCrmAccount,
  cfg: Record<string, unknown>
): Promise<void> {
  const runtime = getShareCrmRuntime();
  const logger = runtime?.logger ?? console;

  // 权限检查
  if (!checkPermission(account, event)) {
    logger.info(`[ShareCRM] 消息被策略拒绝: from=${event.from.id}`);
    return;
  }

  // 构造消息上下文
  const targetId = event.chat_type === "direct" ? event.from.id : event.chat_id;
  const sessionKey = `agent:main:sharecrm:${event.chat_type}:${targetId}`;

  const msgContext = {
    Provider: "sharecrm",
    Surface: "sharecrm",
    Channel: "sharecrm",
    From: event.from.id,
    To: event.chat_id,
    Body: event.text,
    RawBody: event.text,
    BodyForCommands: event.text,
    BodyForAgent: event.text,
    ChatType: event.chat_type,
    AccountId: account.accountId,
    MessageSid: event.message_id,
    MessageSidFull: `sharecrm:${event.message_id}`,
    SessionKey: sessionKey,
    SenderId: event.from.id,
    Timestamp: event.date * 1000,
  };

  logger.info(`[ShareCRM] 收到消息: from=${event.from.name}, text=${event.text.substring(0, 50)}`);
  
  // 调试：打印 runtime 可用的 API
  logger.info(`[ShareCRM] runtime keys: ${Object.keys(runtime || {}).join(", ")}`);
  if (runtime?.channel) {
    logger.info(`[ShareCRM] runtime.channel keys: ${Object.keys(runtime.channel).join(", ")}`);
  }
  const runtimeAny = runtime as unknown as Record<string, unknown>;
  if (runtimeAny?.inbound) {
    logger.info(`[ShareCRM] runtime.inbound keys: ${Object.keys(runtimeAny.inbound as object).join(", ")}`);
  }

  // 路由到 OpenClaw 处理
  if (runtime?.channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
    try {
      await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: msgContext,
        cfg,
        dispatcherOptions: {
          deliver: async (payload: { text?: string }) => {
            const replyText = payload.text || "";
            if (!replyText.trim()) return;

            const targetChatId = account.chatId || event.chat_id;
            const result = await client?.sendMessage(targetChatId, replyText);

            if (!result?.ok) {
              logger.error(`[ShareCRM] 回复失败: ${result?.error}`);
            }
          },
          onError: (err: unknown, info: { kind: string }) => {
            logger.error(`[ShareCRM] 处理错误 (${info.kind}): ${err}`);
          },
        },
      });
    } catch (err) {
      logger.error(`[ShareCRM] 消息处理异常: ${err}`);
    }
  } else {
    logger.info(`[ShareCRM] 消息上下文:`, JSON.stringify(msgContext, null, 2));
  }
}

/**
 * 检查消息权限
 */
function checkPermission(account: ResolvedShareCrmAccount, event: MessageEvent): boolean {
  const { dmPolicy, allowFrom } = account;

  if (event.chat_type === "direct") {
    switch (dmPolicy) {
      case "open":
        return true;
      case "pairing":
        return true;
      case "allowlist":
        return allowFrom.includes("*") || allowFrom.includes(event.from.id.toLowerCase());
      case "disabled":
        return false;
    }
  }

  // 群聊默认允许
  return true;
}

// ============ 插件注册 ============

interface PluginApi {
  logger: Console;
  registerChannel: (opts: { plugin: typeof shareCrmChannel }) => void;
}

export default function register(api: PluginApi): void {
  const logger = api?.logger ?? console;
  logger.info("[ShareCRM] 插件加载中...");
  api.registerChannel({ plugin: shareCrmChannel });
  logger.info("[ShareCRM] Channel 已注册");
}

export { shareCrmChannel };
