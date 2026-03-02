/**
 * OpenClaw ShareCRM Plugin - 入站消息处理
 */

import type {
  ResolvedShareCrmAccount,
  MessageNewPayload,
  ShareCrmMessageContext,
} from './types.js';
import { getShareCrmRuntime } from './runtime.js';

// 已处理消息 seq 的缓存（去重用）
const processedSeqs: Map<string, Set<number>> = new Map();
const MAX_PROCESSED_SEQS = 1000;

/**
 * 处理入站消息
 */
export async function handleInboundMessage(
  account: ResolvedShareCrmAccount,
  payload: MessageNewPayload,
  seq: number
): Promise<void> {
  const runtime = getShareCrmRuntime();
  const logger = runtime?.logger ?? console;
  const { accountId } = account;

  // 1. seq 去重
  if (isDuplicate(accountId, seq)) {
    logger.debug(`[Bot] 跳过重复消息: accountId=${accountId}, seq=${seq}`);
    return;
  }
  markProcessed(accountId, seq);

  // 2. 权限检查
  const allowed = checkPermission(account, payload);
  if (!allowed) {
    logger.info(
      `[Bot] 消息被策略拒绝: from=${payload.from.userId}, chatType=${payload.chatType}`
    );
    return;
  }

  // 3. 构造消息上下文
  const context = buildMessageContext(account, payload);

  // 4. 路由到业务处理
  logger.info(
    `[Bot] 处理消息: sessionKey=${context.sessionKey}, text=${context.text}`
  );

  if (runtime?.routeMessage) {
    await runtime.routeMessage(context);
  } else {
    logger.info(`[Bot] 消息上下文:`, JSON.stringify(context, null, 2));
  }
}

/**
 * 检查消息是否重复
 */
function isDuplicate(accountId: string, seq: number): boolean {
  const seqs = processedSeqs.get(accountId);
  return seqs?.has(seq) ?? false;
}

/**
 * 标记消息已处理
 */
function markProcessed(accountId: string, seq: number): void {
  let seqs = processedSeqs.get(accountId);
  if (!seqs) {
    seqs = new Set();
    processedSeqs.set(accountId, seqs);
  }

  seqs.add(seq);

  // 限制缓存大小
  if (seqs.size > MAX_PROCESSED_SEQS) {
    const arr = Array.from(seqs);
    arr.splice(0, arr.length - MAX_PROCESSED_SEQS);
    processedSeqs.set(accountId, new Set(arr));
  }
}

/**
 * 检查消息权限
 */
function checkPermission(
  account: ResolvedShareCrmAccount,
  payload: MessageNewPayload
): boolean {
  const { chatType, from } = payload;
  const { dmPolicy, allowFrom, groupPolicy, groupAllowFrom } = account;

  if (chatType === 'direct') {
    switch (dmPolicy) {
      case 'open':
        return true;
      case 'pairing':
        return true;
      case 'allowlist':
        return (
          allowFrom.includes('*') ||
          allowFrom.includes(from.userId.toLowerCase())
        );
    }
  } else if (chatType === 'group') {
    switch (groupPolicy) {
      case 'open':
        return true;
      case 'disabled':
        return false;
      case 'allowlist':
        return (
          groupAllowFrom.includes('*') ||
          groupAllowFrom.includes(payload.channelId.toLowerCase())
        );
    }
  }

  return false;
}

/**
 * 构造消息上下文
 */
function buildMessageContext(
  account: ResolvedShareCrmAccount,
  payload: MessageNewPayload
): ShareCrmMessageContext {
  const { accountId } = account;
  const { chatType, channelId, messageId, from, text, mentions } = payload;

  const targetId = chatType === 'direct' ? from.userId : channelId;
  const sessionKey = `agent:main:sharecrm:${chatType}:${targetId}`;

  return {
    accountId,
    chatType,
    channelId,
    messageId,
    from,
    text,
    mentions,
    sessionKey,
  };
}
