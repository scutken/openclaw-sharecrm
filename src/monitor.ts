/**
 * OpenClaw ShareCRM Plugin - 连接生命周期管理
 */

import { ShareCrmClient } from './client.js';
import type {
  Envelope,
  ResolvedShareCrmAccount,
  AccountState,
  AuthOkPayload,
  ConnectionConfig,
  MessageNewPayload,
} from './types.js';
import { DEFAULT_CONNECTION_CONFIG, MessageType } from './types.js';
import { handleInboundMessage } from './bot.js';
import { getShareCrmRuntime } from './runtime.js';
import { setOutboundDeps } from './outbound.js';

// 全局状态
const clients: Map<string, ShareCrmClient> = new Map();
const accountStates: Map<string, AccountState> = new Map();

// 初始化 outbound 依赖
setOutboundDeps(
  (accountId) => clients.get(accountId),
  (accountId) => accountStates.get(accountId)
);

/**
 * 启动账号监控
 */
export async function startAccountMonitor(
  account: ResolvedShareCrmAccount,
  abortSignal?: AbortSignal
): Promise<void> {
  const { accountId, gatewayUrl, appId, appSecret } = account;
  const runtime = getShareCrmRuntime();
  const logger = runtime?.logger ?? console;

  if (!gatewayUrl || !appId || !appSecret) {
    logger.error(`[Monitor] 账号 ${accountId} 配置不完整`);
    return;
  }

  // 初始化状态
  const state: AccountState = {
    connected: false,
    reconnectAttempts: 0,
    lastSeq: 0,
  };
  accountStates.set(accountId, state);

  // 处理中止信号
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => {
      logger.info(`[Monitor] 收到中止信号，停止账号 ${accountId}`);
      stopAccountMonitor(accountId);
    });
  }

  // 启动连接
  await connectWithRetry(account, state);
}

/**
 * 带重试的连接
 */
async function connectWithRetry(
  account: ResolvedShareCrmAccount,
  state: AccountState,
  config: ConnectionConfig = DEFAULT_CONNECTION_CONFIG
): Promise<void> {
  const runtime = getShareCrmRuntime();
  const logger = runtime?.logger ?? console;
  const { accountId, gatewayUrl, appId, appSecret } = account;

  const client = new ShareCrmClient(
    {
      gatewayUrl: gatewayUrl!,
      appId: appId!,
      appSecret: appSecret!,
      logger,

      onEvent: (envelope: Envelope) => {
        handleEvent(account, state, envelope);
      },

      onConnected: (payload: AuthOkPayload) => {
        state.connected = true;
        state.reconnectAttempts = 0;
        state.lastConnectedAt = new Date();
        state.sessionId = payload.sessionId;
        state.botId = payload.botId;
        state.botName = payload.botName;
        state.lastError = undefined;
        logger.info(`[Monitor] 账号 ${accountId} 连接成功`);
      },

      onDisconnected: (reason: string) => {
        state.connected = false;
        state.lastDisconnectedAt = new Date();
        logger.warn(`[Monitor] 账号 ${accountId} 断开连接: ${reason}`);

        // 尝试重连
        if (state.reconnectAttempts < config.maxReconnectAttempts) {
          const delay = config.reconnectDelays[
            Math.min(state.reconnectAttempts, config.reconnectDelays.length - 1)
          ];
          state.reconnectAttempts++;
          logger.info(
            `[Monitor] ${delay}ms 后尝试第 ${state.reconnectAttempts} 次重连`
          );
          setTimeout(() => connectWithRetry(account, state, config), delay);
        } else {
          state.lastError = `重连失败，已达最大重试次数 (${config.maxReconnectAttempts})`;
          logger.error(`[Monitor] 账号 ${accountId} ${state.lastError}`);
        }
      },

      onError: (error: Error) => {
        state.lastError = error.message;
        logger.error(`[Monitor] 账号 ${accountId} 错误: ${error.message}`);
      },
    },
    config
  );

  clients.set(accountId, client);

  try {
    await client.connect();
  } catch (error) {
    logger.error(`[Monitor] 账号 ${accountId} 连接失败:`, error);
    // 连接失败也触发重连逻辑
    if (state.reconnectAttempts < config.maxReconnectAttempts) {
      const delay = config.reconnectDelays[
        Math.min(state.reconnectAttempts, config.reconnectDelays.length - 1)
      ];
      state.reconnectAttempts++;
      setTimeout(() => connectWithRetry(account, state, config), delay);
    }
  }
}

/**
 * 处理收到的事件
 */
function handleEvent(
  account: ResolvedShareCrmAccount,
  state: AccountState,
  envelope: Envelope
): void {
  const runtime = getShareCrmRuntime();
  const logger = runtime?.logger ?? console;

  // 更新 seq
  if (envelope.seq && envelope.seq > state.lastSeq) {
    state.lastSeq = envelope.seq;
  }

  switch (envelope.type) {
    case MessageType.MESSAGE_NEW: {
      state.lastInboundAt = new Date();
      const payload = envelope.payload as MessageNewPayload;
      logger.info(
        `[Monitor] 收到新消息: from=${payload.from.name}, text=${payload.text}`
      );
      handleInboundMessage(account, payload, envelope.seq ?? 0);
      break;
    }

    default:
      logger.debug(`[Monitor] 收到事件: ${envelope.type}`);
  }
}

/**
 * 停止账号监控
 */
export function stopAccountMonitor(accountId: string): void {
  const client = clients.get(accountId);
  if (client) {
    client.disconnect();
    clients.delete(accountId);
  }
  accountStates.delete(accountId);
}

/**
 * 获取账号状态
 */
export function getAccountState(accountId: string): AccountState | undefined {
  return accountStates.get(accountId);
}

/**
 * 获取客户端实例
 */
export function getClient(accountId: string): ShareCrmClient | undefined {
  return clients.get(accountId);
}

/**
 * 获取所有账号状态
 */
export function getAllAccountStates(): Map<string, AccountState> {
  return new Map(accountStates);
}
