# ShareCRM IM Gateway 开放接口文档

本文档可用于指导类似OpenClaw类产品的 ShareCRM（纷享销客）渠道插件开发。

## 目录

- [通用说明](#通用说明)
- [鉴权接口](#鉴权接口)
- [SSE 连接接口](#sse-连接接口)
- [消息发送接口](#消息发送接口)
- [错误码](#错误码)

---

## 通用说明

### 接口路径
- 基础域名（可更换）: 默认值 `https://open.fxiaoke.com`
- 接口前缀（不可更换）: `/im-gateway`


### 统一响应格式

```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 状态码，0 表示成功 |
| msg | string | 状态信息 |
| data | object | 返回数据（可选） |

---

## 鉴权接口

### 1. 健康检查

检测服务是否正常运行。

**请求**

```
GET /im-gateway/ping
```

**响应**

```
pong
```

---

### 2. 获取 AccessToken

使用 appId 和 appSecret 获取访问令牌。

**请求**

```
POST /im-gateway/auth/token
Content-Type: application/json
```

**请求体**

```json
{
  "appId": "your_app_id",
  "appSecret": "your_app_secret"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| appId | string | 是 | 应用 ID |
| appSecret | string | 是 | 应用密钥 |

**成功响应**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR...",
    "expiresIn": 7200,
    "tokenType": "Bearer"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| accessToken | string | 访问令牌 |
| expiresIn | int | 过期时间（秒） |
| tokenType | string | 令牌类型，固定为 `Bearer` |

**失败响应**

```json
{
  "code": 40004,
  "msg": "Account disabled"
}
```

---

## SSE 连接接口

### 建立 SSE 长连接

Bot 通过 SSE（Server-Sent Events）建立与网关的长连接，用于接收消息推送。

**请求**

```
GET /im-gateway/bot/events?token={accessToken}
Accept: text/event-stream
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| token | string | 是 | 通过 `/auth/token` 接口获取的 accessToken |

**协议说明**

- 连接即鉴权，token 通过 URL 参数传递
- 单设备限制：新连接会断开同一 appId 的旧连接
- 连接超时：永不超时（服务端不主动断开）

**事件类型**

| 事件名 | 说明 |
|--------|------|
| connected | 连接成功 |
| ping | 心跳 |
| message | 收到消息 |
| error | 错误通知 |

**connected 事件**

连接成功后立即推送：

```
event: connected
data: {"type":"connected","data":{"bot_id":"your_app_id"}}
```

**message 事件**

收到用户消息时推送：

```
event: message
data: {"type":"message","data":{"chat_id":"xxx","text":"用户消息","message_id":"msg-xxx",...}}
```

**错误响应**

| HTTP 状态码 | 说明 |
|------------|------|
| 401 | Token 缺失、无效或过期 |

---

## 消息发送接口

### 发送消息到企信

Bot 调用此接口向企信用户发送消息。

**请求**

```
POST /im-gateway/qixin/message/send
Content-Type: application/json
Authorization: Bearer {accessToken}
```

**请求体**

```json
{
  "chat_id": "编码后的会话ID",
  "text": "要发送的消息内容",
  "reply_message_id": 123456
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| chat_id | string | 是 | 会话 ID（编码格式，由收到消息时携带） |
| text | string | 是 | 消息文本内容 |
| reply_message_id | long | 否 | 回复的消息 ID |

**成功响应**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "message_id": "msg-1709712345678"
  }
}
```

**失败响应示例**

```json
{
  "code": 50001,
  "msg": "Bot not connected"
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 40001 | 缺少必填参数 |
| 40002 | 参数无效 |
| 40003 | 缺少或无效的 Authorization 头 |
| 40004 | 账户已禁用 |
| 40005 | 账户不存在 |
| 40100 | Token 无效 |
| 40101 | Token 已过期 |
| 50001 | Bot 未连接 |
| 50000 | 服务器内部错误 |

---

## 调用流程

```
┌─────────┐                    ┌─────────────┐                    ┌─────────┐
│   Bot   │                    │  IM Gateway │                    │  企信   │
└────┬────┘                    └──────┬──────┘                    └────┬────┘
     │                                │                                │
     │ 1. POST /auth/token            │                                │
     │ ──────────────────────────────>│                                │
     │        (appId, appSecret)      │                                │
     │                                │                                │
     │ 2. accessToken                 │                                │
     │ <──────────────────────────────│                                │
     │                                │                                │
     │ 3. GET /bot/events?token=xxx   │                                │
     │ ──────────────────────────────>│                                │
     │        (建立 SSE 连接)          │                                │
     │                                │                                │
     │ 4. event: connected            │                                │
     │ <──────────────────────────────│                                │
     │                                │                                │
     │                                │ 5. 用户发送消息                  │
     │                                │ <──────────────────────────────│
     │                                │                                │
     │ 6. event: message              │                                │
     │ <──────────────────────────────│                                │
     │        (收到用户消息)           │                                │
     │                                │                                │
     │ 7. POST /qixin/message/send    │                                │
     │ ──────────────────────────────>│                                │
     │        (Bot 回复消息)           │                                │
     │                                │ 8. 转发消息到企信               │
     │                                │ ──────────────────────────────>│
     │                                │                                │
     │ 9. message_id                  │                                │
     │ <──────────────────────────────│                                │
     │                                │                                │
```
