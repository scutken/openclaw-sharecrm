# ShareCRM IM Gateway 对外接口文档（Gateway v1.2）

本文档面向 OpenClaw 等 AI Agentic Bot 渠道插件开发者，描述 ShareCRM IM Gateway v1.2 对外开放的 HTTP API 与 SSE 协议。

文档内容以当前代码实现为准。

---

## 1. 基本信息

### 1.1 基础路径

- 基础域名：由部署环境提供，例如 `https://open.fxiaoke.com`
- 固定前缀：`/im-gateway`

### 1.2 统一响应格式

除 `GET /im-gateway/ping` 与 SSE 流式事件外，其余开放接口统一返回：

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | int | 业务状态码，`0` 表示成功 |
| `msg` | string | 状态描述 |
| `data` | object | 返回数据，失败时通常为空 |

---

## 2. 接口总览

### 2.1 HTTP Open API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/im-gateway/ping` | 健康检查 |
| `POST` | `/im-gateway/auth/token` | 获取 AccessToken |
| `POST` | `/im-gateway/qixin/message/send` | Bot 向企信发送文本消息 |

### 2.2 SSE 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/im-gateway/bot/events` | Bot 建立 SSE 长连接并接收事件 |

---

## 3. 健康检查

### 3.1 请求

```http
GET /im-gateway/ping
```

### 3.2 响应

```text
pong
```

---

## 4. 获取 AccessToken

使用 Gateway 接入应用 ID（`appId`）和 `appSecret` 获取后续调用开放接口所需的访问令牌。

### 4.1 请求

```http
POST /im-gateway/auth/token
Content-Type: application/json
```

请求体：

```json
{
  "appId": "your_app_id",
  "appSecret": "your_app_secret"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `appId` | string | 是 | Gateway 接入应用 ID，用于鉴权与建立连接；可调整 |
| `appSecret` | string | 是 | Gateway 接入密钥 |

### 4.2 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 7200,
    "tokenType": "Bearer"
  }
}
```

`data` 字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `accessToken` | string | 访问令牌 |
| `expiresIn` | long | 过期时间，单位秒 |
| `tokenType` | string | 固定为 `Bearer` |

### 4.3 失败示例

```json
{
  "code": 40004,
  "msg": "Account disabled"
}
```

---

## 5. SSE 长连接

Bot 通过该接口与 Gateway 建立单向事件流，用于接收连接确认、心跳和企信消息。

补充说明：

- `bot_full_id` 表示 Bot 在企信侧的唯一标识
- 一个 `bot_full_id` 可映射到一个 `appId`
- `appId` 主要用于 Gateway 鉴权与连接管理，允许后续调整

### 5.1 请求

```http
GET /im-gateway/bot/events?token={accessToken}&version=1.2.0
Accept: text/event-stream
```

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `token` | string | 是 | 通过 `/im-gateway/auth/token` 获取的 AccessToken |
| `version` | string | 否 | Bot 插件版本。建议传 `1.2.0` 或更高版本，以启用 v1.2 消息结构 |

### 5.2 连接行为

- 连接即鉴权，鉴权失败会直接返回 `401`
- 同一个 `appId` 仅允许一个活跃连接，新连接会替换旧连接
- 当 `version >= 1.2.0` 时：
  - 服务端会启用 SSE 超时配置
  - `connected` 事件中返回 `max_lifetime`
  - `message` 事件返回 v1.2 结构字段
- 心跳事件默认每 30 秒发送一次

### 5.3 事件类型

| 事件名 | 说明 |
|---|---|
| `connected` | 建连成功后的首个事件 |
| `ping` | 心跳事件 |
| `message` | 来自企信的消息事件 |

---

## 6. SSE 事件结构

## 6.1 connected

事件名：`connected`

示例：

```text
event: connected
data: {"type":"connected","data":{"bot_full_id":"B.fs.bot_demo","version":"1.2.0","max_lifetime":1800000}}
```

说明：`connected.data.bot_full_id` 是 Bot 在企信侧的完整 ID。

JSON 结构：

```json
{
  "type": "connected",
  "data": {
    "bot_full_id": "B.fs.bot_demo",
    "version": "1.2.0",
    "max_lifetime": 1800000
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | string | 固定为 `connected` |
| `data.bot_full_id` | string | Bot 在企信侧的完整 ID，例如 `B.fs.bot_demo` |
| `data.version` | string | 建连时传入的插件版本 |
| `data.max_lifetime` | long | 连接最大存活时间，单位毫秒 |

## 6.2 ping

事件名：`ping`

示例：

```text
event: ping
data: {"type":"ping","time":1710000000}
```

JSON 结构：

```json
{
  "type": "ping",
  "time": 1710000000
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | string | 固定为 `ping` |
| `time` | long | 服务端当前 Unix 时间戳，单位秒 |

## 6.3 message（Gateway v1.2 推荐接入格式）

事件名：`message`

当 Bot 建连时传入 `version >= 1.2.0`，当前实现会发送如下结构：

```text
event: message
data: {"type":"message","version":"1.0","data":{"message_id":"123456789","chat_id":"0:fs:session123:","chat_type":"direct","from":{"id":"7618","name":"7618"},"text":"你好","date":1710000000,"message":{"type":"text","content":"你好"},"timestamp":1710000000,"env":0,"ea":"fs","session_id":"session123","parent_session_id":null,"bot_full_id":"B.fs.bot_demo","message_type":"T","reply_message_id":null}}
```

JSON 结构：

```json
{
  "type": "message",
  "version": "1.0",
  "data": {
    "message_id": "123456789",
    "chat_id": "0:fs:session123:",
    "chat_type": "direct",
    "from": {
      "id": "7618",
      "name": "7618"
    },
    "text": "你好",
    "date": 1710000000,
    "message": {
      "type": "text",
      "content": "你好"
    },
    "timestamp": 1710000000,
    "env": 0,
    "ea": "fs",
    "session_id": "session123",
    "parent_session_id": null,
    "bot_full_id": "B.fs.bot_demo",
    "message_type": "T",
    "reply_message_id": null
  }
}
```

字段说明：

### 根字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | string | 固定为 `message` |
| `version` | string | 当前实现中固定返回 `1.0`；请以 `data` 的字段结构作为解析依据 |
| `data` | object | 消息体 |

### data 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `message_id` | string | 企信原始消息 ID |
| `chat_id` | string | 编码后的会话 ID，回复消息时原样传回 |
| `chat_type` | string | 会话类型，当前为 `direct` 或 `group` |
| `from.id` | string | 发送人 ID |
| `from.name` | string | 发送人名称，当前实现通常取 `senderFullId` 的最后一段 |
| `text` | string | 文本内容，兼容字段 |
| `date` | long | 消息时间戳，单位秒，兼容字段 |
| `message.type` | string | 当前固定为 `text` |
| `message.content` | string | 文本消息内容 |
| `timestamp` | long | 消息时间戳，单位秒 |
| `env` | int | 是否互联：`0` 企业内，`1` 互联 |
| `ea` | string | 企业标识 |
| `session_id` | string | 企信会话 ID |
| `parent_session_id` | string/null | 父会话 ID |
| `bot_full_id` | string | Bot 在企信侧的完整 ID，例如 `B.fs.bot_demo` |
| `message_type` | string | 企信原始消息类型，如 `T` |
| `reply_message_id` | long/null | 如果该消息为回复消息，则为被回复消息 ID |

### 6.4 `chat_id` 说明

`chat_id` 由 Gateway 编码生成，格式如下：

```text
{env}:{ea}:{sessionId}:{parentSessionId}
```

示例：

```text
0:fs:session123:
0:fs:session123:parent456
```

Bot 在调用发送接口时，应直接使用收到的 `chat_id`，不要自行改写。

补充说明：

- 当前 Gateway 对外发送接口以 `chat_id` 为唯一会话定位参数
- 不支持“仅传 `from.id` 直接发送”这种对外协议
- 如果上层想按用户维度发送，需要先持有该用户最近一次入站消息带来的 `chat_id`

---

## 7. Bot 发送消息到企信

Bot 处理完 SSE 下发的消息后，通过该接口回发文本消息给企信。

### 7.1 请求

```http
POST /im-gateway/qixin/message/send
Content-Type: application/json
Authorization: Bearer {accessToken}
```

请求体：

```json
{
  "chat_id": "0:fs:session123:",
  "text": "你好，我是机器人",
  "reply_message_id": 123456789
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `chat_id` | string | 是 | 来自 `message` 事件的会话标识 |
| `text` | string | 是 | 要发送的文本消息 |
| `reply_message_id` | long | 否 | 回复某条企信消息时可传 |

### 7.2 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message_id": "987654321"
  }
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.message_id` | string | 企信侧返回的新消息 ID |

### 7.3 失败示例

```json
{
  "code": 50001,
  "msg": "Bot not connected"
}
```

### 7.4 关于 `from.id` 发送

当前版本：**不支持直接使用 `from.id` 调用 Gateway 发送消息到企信**。

原因：

- 对外发送接口的会话定位参数只有 `chat_id`
- `from.id` 仅表示消息发送人，不足以唯一表达当前企信会话
- 同一个用户可能对应不同会话上下文，因此回复时应始终使用实际收到的 `chat_id`

推荐做法：

- Bot 在收到入站消息后，保存 `from.id -> chat_id` 的映射
- 后续需要按用户回复时，优先使用最近一次有效 `chat_id`

---

## 8. Gateway 内置命令

为了方便排查与接入，Gateway 对来自企信的特定文本命令做了本地拦截。

这些命令**不会转发给 Bot**，而是由 Gateway 直接回复到当前会话。

| 命令 | 说明 | 返回内容 |
|---|---|---|
| `!!` | 查看命令列表 | 返回当前支持的命令帮助 |
| `!userId` | 查看当前发送人的 userId | 返回 `from.id` 对应的用户 ID |
| `!chatId` | 查看当前会话 chat_id | 返回当前会话的 `chat_id` |

适用场景：

- 快速确认当前用户 ID
- 快速确认当前会话的 `chat_id`
- 协助排查 Bot 按用户/会话发送时的路由问题

---

## 9. 错误码

| 错误码 | 含义 |
|---|---|
| `0` | 成功 |
| `40001` | 缺少必填参数 |
| `40002` | 参数无效 |
| `40003` | 缺少或非法 Authorization Header |
| `40004` | 账号已禁用 |
| `40005` | 账号不存在 |
| `40100` | Token 无效 |
| `40101` | Token 已过期 |
| `50000` | 服务内部错误 |
| `50001` | Bot 未在线 |

---

## 10. 推荐调用流程

```text
1. Bot 调用 POST /im-gateway/auth/token 获取 accessToken
2. Bot 使用 GET /im-gateway/bot/events?token=...&version=1.2.0 建立 SSE 连接
3. Bot 接收 connected 事件，确认连接建立
4. Bot 持续接收 ping 心跳和 message 消息事件
5. Bot 处理 message.data，并保留 chat_id
6. Bot 调用 POST /im-gateway/qixin/message/send 回复企信消息
```

---

## 11. 接入建议

- 建连时始终传 `version=1.2.0` 或更高版本
- 回复时直接复用 `message.data.chat_id`
- 不要尝试只根据 `from.id` 直接调用发送接口
- `message.text` 可用于快速兼容；推荐优先使用 `message.message.content`
- 同一 `appId` 只保留一个活跃连接，避免多个实例同时连接

---

## 12. 重试与重连策略

### 11.1 总原则

- 仅对临时性失败执行重试，不要对参数错误、账号错误或权限错误做无限重试
- 建议所有重试都采用指数退避，并加入少量随机抖动，避免集中重试放大流量
- 建议将 Token 获取、SSE 重连、发送消息失败重试分开处理

### 11.2 获取 Token 重试建议

适用接口：`POST /im-gateway/auth/token`

建议策略：

- 以下情况可重试：网络超时、连接失败、`50000`
- 以下情况不要重试，应直接修正配置或参数：`40001`、`40002`、`40004`、`40005`
- 建议最多重试 3 次
- 建议退避时间：`1s`、`2s`、`4s`
- 每次重试可附加 `0% ~ 20%` 的随机抖动

### 11.3 SSE 重连建议

适用接口：`GET /im-gateway/bot/events`

建议策略：

- 发生网络中断、读超时、服务端主动断开、服务端 `5xx` 时，应主动重连
- 如果建连返回 `401`，建议先重新获取 Token，再重新建立 SSE 连接
- 不建议无间隔高频重连
- 建议使用指数退避：`1s`、`2s`、`4s`、`8s`、`16s`，之后封顶为 `30s`
- 每次重连建议附加 `0% ~ 20%` 的随机抖动
- 同一 `appId` 仅保留一个活跃连接，避免多个实例反复互相顶掉连接

### 11.4 发送消息失败重试建议

适用接口：`POST /im-gateway/qixin/message/send`

建议策略：

- 以下情况可重试：网络超时、连接失败、`50000`
- `50001` 表示 Bot 当前未在线，建议优先恢复 SSE 连接，再重试发送
- `40100`、`40101` 表示 Token 无效或已过期，建议先重新获取 Token，再重新发起一次请求
- 以下情况不要重试：`40001`、`40002`、`40003`、`40004`、`40005`

注意：

- 当前发送接口文档未定义幂等键
- 如果请求已经被服务端处理成功，但客户端因网络原因未收到响应，直接重试可能导致重复发送
- 因此建议仅在“可以确认本次请求未成功到达服务端”或“业务允许少量重复消息”的前提下进行重试
- 对发送接口建议控制重试次数，通常不超过 1 次

### 11.5 推荐处理流程

```text
1. 调用 POST /im-gateway/auth/token 获取 accessToken
2. 使用 accessToken 建立 SSE 连接
3. SSE 断开时：
   - 若为 401：重新获取 Token 后重连
   - 若为网络异常或 5xx：按指数退避重连
4. 调用发送接口失败时：
   - 若为 40100/40101：刷新 Token 后重试 1 次
   - 若为 50001：等待 SSE 恢复后重试 1 次
   - 若为参数类错误：直接报错，不重试
```
