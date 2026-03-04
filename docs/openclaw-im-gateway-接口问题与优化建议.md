# OpenClaw 与 IM Gateway 接口问题与优化建议

## 1. 结论概览

当前接口交互存在 4 个重点问题，其中 2 个会直接导致消息发送失败。

## 2. 问题明细

## P0（高）私聊回复目标使用了 `userId`，而 Gateway 发送接口要求 `chat_id`

现象：

- 插件入站时把私聊 `to` 设为 `user:{senderId}`。  
  代码：`openclaw-sharecrm/src/monitor.ts:146`
- 插件发送时把 `user:` 前缀去掉后直接当 `chat_id` 发送。  
  代码：`openclaw-sharecrm/src/channel.ts:274-275`
- Gateway 会对 `chat_id` 做 `QixinSessionId.decode`，要求格式 `{env}:{ea}:{sessionId}:{parentSessionId}`。  
  代码：`sharecrm-im-gateway/.../QixinMessageController.java:92`, `.../QixinSessionId.java:66-83`
- 企信入站时 `from.id` 实际来源是 `senderFullId`（如 `E.fs.7618`），不是会话 `chat_id`。  
  代码：`sharecrm-im-gateway/.../BotMessageController.java:81-87`, `.../SessionManager.java:125-127`

影响：

- 默认私聊回复很可能传入 `E.fs.xxx`，导致 `decode(chat_id)` 失败，最终返回 `50001`。

建议：

1. 私聊上下文默认回复目标改为 `chat:{chat_id}`，不要用 `user:{senderId}`。
2. 对 `user:` 目标增加显式映射转换（`userId -> 最近 chat_id`），无映射时直接返回可读错误，不发请求。

## P0（高）配对通过通知使用 `id` 直接发消息，无法保证是合法 `chat_id`

现象：

- 配对通知直接调用 `client.sendMessage(id, ...)`。  
  代码：`openclaw-sharecrm/src/channel.ts:38-46`
- 配对 `id` 来源是消息发送者 `senderId`。  
  代码：`openclaw-sharecrm/src/monitor.ts:95`

影响：

- 在当前网关契约下，`id` 往往不是可解码 `chat_id`，配对成功通知可能发送失败。

建议：

1. 配对申请记录中额外持久化 `lastChatId`。
2. `notifyApproval` 优先使用 `lastChatId` 发送，找不到时回退为“仅后台通过，不主动消息通知”并记录告警。

## P1（中）`chat_id` 非法格式被归类为 500，错误码语义不准确

现象：

- Gateway 只对 `chat_id` 空值返回 `40002`。  
  代码：`sharecrm-im-gateway/.../QixinMessageController.java:60-65`
- 但格式错误（`decode` 抛 `IllegalArgumentException`）会走兜底异常，返回 `50001`。  
  代码：`.../QixinMessageController.java:92`, `:139-143`

影响：

- 调用方无法区分“参数错误”与“服务端错误”，影响重试策略和故障定位。

建议：

1. 增加 `onErrorResume(IllegalArgumentException.class, ...)` 返回 `40002`。
2. 错误信息包含简短格式提示，例如：`chat_id 必须是 env:ea:sessionId:parentSessionId`。

## P2（中）Gateway 下行 `chat_type` 固定为 `direct`，插件群策略无法生效

现象：

- 网关发送给插件时 `chat_type` 写死为 `"direct"`。  
  代码：`sharecrm-im-gateway/.../SessionManager.java:124`
- 插件实现了 `groupPolicy/groupAllowFrom/historyLimit` 等群聊逻辑。  
  代码：`openclaw-sharecrm/src/monitor.ts:117-141`

影响：

- 即便未来接入群消息，当前协议也无法让插件区分群聊与私聊。

建议：

1. 在 `/bot/message/send` 入参中增加 `chatType`（`direct/group`），网关原样透传到 WS `data.chat_type`。
2. 对历史消息上下文可选透传（已存在 `historyMessages` 字段，可按需扩展）。

## 3. 建议改造顺序

1. 先修复 P0（回复目标与配对通知），这是可用性阻断项。
2. 再修复 P1（错误码语义），提升联调可观测性。
3. 最后处理 P2（群聊能力），作为协议增强。

## 4. 回归验证建议

1. 私聊消息入站后，默认回复应返回 `code=0`，且网关日志中 `QixinSessionId.decode` 成功。
2. 配对通过后通知消息应可送达，不再出现 `chat_id` 解析异常。
3. 非法 `chat_id` 应返回 `40002`，不应返回 `50001`。
4. 增加 `group` 消息样例后，插件应进入群聊策略分支。

可执行样例见：`docs/openclaw-im-gateway-联调与回归用例.md`。
