/**
 * OpenClaw ShareCRM Plugin - 出站消息适配
 */

import type { CommandAckPayload, AccountState } from './types.js';
import { getShareCrmRuntime } from './runtime.js';

// 客户端和状态的外部引用（由 monitor 设置）
let getClientFn: ((accountId: string) => unknown | undefined) | null = null;
let getStateFn: ((accountId: string) => AccountState | undefined) | null = null;

/**
 * 设置外部依赖
 */
export function setOutboundDeps(
  clientGetter: (accountId: string) => unknown | undefined,
  stateGetter: (accountId: string) => AccountState | undefined
): void {
  getClientFn = clientGetter;
  getStateFn = stateGetter;
}

export interface SendMessageOptions {
  accountId?: string;
  channelId: string;
  text: string;
  replyTo?: string;
}

/**
 * 发送消息
 */
export async function sendMessage(
  options: SendMessageOptions
): Promise<CommandAckPayload> {
  const runtime = getShareCrmRuntime();
  const logger = runtime?.logger ?? console;

  const accountId = options.accountId ?? 'default';
  
  if (!getClientFn || !getStateFn) {
    throw new Error('Outbound 依赖未初始化');
  }

  const client = getClientFn(accountId) as { sendMessage: (channelId: string, text: string, replyTo?: string) => Promise<CommandAckPayload> } | undefined;
  const state = getStateFn(accountId);

  if (!client || !state?.connected) {
    throw new Error(`账号 ${accountId} 未连接`);
  }

  logger.info(
    `[Outbound] 发送消息: channelId=${options.channelId}, text=${options.text}`
  );

  const result = await client.sendMessage(
    options.channelId,
    options.text,
    options.replyTo
  );

  // 更新状态
  if (state) {
    state.lastOutboundAt = new Date();
  }

  if (result.success) {
    logger.info(`[Outbound] 消息发送成功: messageId=${result.messageId}`);
  } else {
    logger.error(`[Outbound] 消息发送失败: ${result.errorMessage}`);
  }

  return result;
}

/**
 * 发送文本消息（简化接口）
 */
export async function sendText(
  channelId: string,
  text: string,
  accountId?: string
): Promise<CommandAckPayload> {
  return sendMessage({ accountId, channelId, text });
}

/**
 * 回复消息
 */
export async function replyMessage(
  channelId: string,
  text: string,
  replyTo: string,
  accountId?: string
): Promise<CommandAckPayload> {
  return sendMessage({ accountId, channelId, text, replyTo });
}
