# OpenClaw 插件端与 IM Gateway 交互说明（基于当前代码）

## 1. 分析范围

本说明基于以下代码进行对照：

- `openclaw-sharecrm/src/client.ts`
- `openclaw-sharecrm/src/monitor.ts`
- `openclaw-sharecrm/src/channel.ts`
- `sharecrm-im-gateway/src/main/java/com/fxiaoke/sharecrm/im/gateway/controller/open/AuthController.java`
- `sharecrm-im-gateway/src/main/java/com/fxiaoke/sharecrm/im/gateway/controller/open/QixinMessageController.java`
- `sharecrm-im-gateway/src/main/java/com/fxiaoke/sharecrm/im/gateway/controller/BotMessageController.java`
- `sharecrm-im-gateway/src/main/java/com/fxiaoke/sharecrm/im/gateway/websocket/BotWebSocketHandler.java`
- `sharecrm-im-gateway/src/main/java/com/fxiaoke/sharecrm/im/gateway/websocket/SessionManager.java`
- `sharecrm-im-gateway/src/main/java/com/fxiaoke/sharecrm/im/gateway/qixin/QixinSessionId.java`

## 2. 总体通信模型

- 插件鉴权：`POST /im-gateway/auth/token`
- 插件下行接收：`WS /im-gateway/bot?token={accessToken}`
- 插件上行发送：`POST /im-gateway/qixin/message/send`
- 企信入站到网关：`POST /bot/message/send`

方向上是双通道：

- 企信/模拟器 -> 网关 -> WebSocket -> OpenClaw 插件
- OpenClaw 插件 -> REST -> 网关 -> 企信 API

## 3. 关键交互链路

## 3.1 插件鉴权与建连

1. 插件调用 `POST /im-gateway/auth/token` 获取 token。  
代码：`openclaw-sharecrm/src/client.ts:50`
2. Gateway 鉴权并返回 `accessToken/expiresIn/tokenType`。  
代码：`sharecrm-im-gateway/.../AuthController.java:39`, `:55-60`
3. 插件用 token 连接 `WS /im-gateway/bot?token=...`。  
代码：`openclaw-sharecrm/src/client.ts:81`
4. Gateway 校验 token 后发送 `connected` 消息。  
代码：`sharecrm-im-gateway/.../BotWebSocketHandler.java:37`, `:85`, `:104`

## 3.2 企信消息入站（给插件）

1. 企信侧调用 `POST /bot/message/send`。  
代码：`sharecrm-im-gateway/.../BotMessageController.java:21`, `:33`
2. Gateway 将 `{env,ea,sessionId,parentSessionId}` 编码为 `chat_id`。  
代码：`.../BotMessageController.java:67`, `.../QixinSessionId.java:50`
3. Gateway 推送 WS `type=message` 给插件，核心字段：`message_id/chat_id/chat_type/from/text/date`。  
代码：`.../SessionManager.java:122-132`
4. 插件按 `ShareCrmMessageEvent` 解析消息并进入路由。  
代码：`openclaw-sharecrm/src/types.ts:35-47`, `openclaw-sharecrm/src/monitor.ts`

## 3.3 插件消息上行（给企信）

1. 插件通过 REST 调用 `POST /im-gateway/qixin/message/send`，请求体使用 `chat_id + text`。  
代码：`openclaw-sharecrm/src/client.ts:163-172`
2. Gateway 从 `Authorization: Bearer` 读取 token 并校验。  
代码：`.../QixinMessageController.java:49`, `:76`, `:127`
3. Gateway 解析 `chat_id` 为 `env/ea/sessionId/parentSessionId` 后调用企信 API。  
代码：`.../QixinMessageController.java:92-100`, `.../QixinSessionId.java:66-83`

## 4. 字段映射（当前实现）

| 来源 | 网关输出给插件 | 插件使用方式 |
| --- | --- | --- |
| `env/ea/sessionId/parentSessionId` | `data.chat_id`（编码串） | 发送回复时应回传同一会话标识 |
| `senderFullId` | `data.from.id` | 插件作为发送者身份和 DM 策略判断 |
| `messageContent` | `data.text` | 作为 Agent 输入正文 |
| `messageTimestamp` | `data.date`（秒） | 插件转 `new Date(data.date * 1000)` |
| 固定值 | `data.chat_type = "direct"` | 插件按私聊路径处理 |

## 5. 错误码语义（REST）

`/im-gateway/auth/token`：

- `0` 成功
- `40001` 凭据缺失或错误
- `40004` 账号禁用

`/im-gateway/qixin/message/send`：

- `0` 成功
- `40002` 请求参数缺失（`chat_id/text`）
- `40003` token 无效或过期
- `40004` 账号禁用
- `50001` Bot 不在线或服务端异常

## 6. 结论（接口契约层面）

- 插件与 Gateway 在主协议路径上是对齐的：鉴权、WS 建连、消息结构、上行 REST 路径均能对应。
- 但在“私聊目标标识”的使用上存在关键不一致（`userId` 与 `chat_id` 混用），会影响真实回复成功率。  
详细问题见文档：`docs/openclaw-im-gateway-接口问题与优化建议.md`。

联调与回归示例见：`docs/openclaw-im-gateway-联调与回归用例.md`。
