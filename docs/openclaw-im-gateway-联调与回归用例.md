# OpenClaw 与 IM Gateway 联调与回归用例

## 1. 目标

用于验证以下关键行为是否符合当前实现：

1. 插件与 Gateway 的鉴权、建连、收发链路可用。
2. 私聊回复使用 `chat_id`，不再把 `userId` 当 `chat_id`。
3. 非法 `chat_id` 返回 `40002`（参数错误）。
4. `chat_type` 支持 `direct/group` 透传。

## 2. 前置条件

1. 启动 `sharecrm-im-gateway` 服务（默认 `8099`）。
2. 配好 `accounts.yml`（至少一个 `app-id/app-secret/bot-full-id`）。
3. 插件端配置 `gatewayUrl/apiBaseUrl/appId/appSecret`。

示例配置（OpenClaw）：

```yaml
channels:
  sharecrm:
    gatewayUrl: "ws://localhost:8099"
    apiBaseUrl: "http://localhost:8099"
    appId: "app-example1"
    appSecret: "sk-example-secret-1"
```

## 3. 用例 A：鉴权 + WS 连接

请求 token：

```bash
curl -X POST "http://localhost:8099/im-gateway/auth/token" \
  -H "Content-Type: application/json" \
  -d '{"appId":"app-example1","appSecret":"sk-example-secret-1"}'
```

期望：

```json
{"code":0,"data":{"accessToken":"...","expiresIn":7200,"tokenType":"Bearer"}}
```

WS 连接地址：

```text
ws://localhost:8099/im-gateway/bot?token={accessToken}
```

期望收到：

```json
{"type":"connected","data":{"bot_id":"app-example1"}}
```

## 4. 用例 B：企信入站（direct）到插件

调用：

```bash
curl -X POST "http://localhost:8099/bot/message/send" \
  -H "Content-Type: application/json" \
  -d '{
    "env":0,
    "ea":"fs",
    "botFullId":"B.fs.bot001",
    "sessionId":"session-001",
    "parentSessionId":"",
    "messageType":"T",
    "chat_type":"direct",
    "messageContent":"你好",
    "senderFullId":"E.fs.7618"
  }'
```

期望插件侧收到 WS 消息 `data.chat_type = "direct"`，`data.chat_id` 为编码后的会话 ID（如 `0:fs:session-001:`）。

## 5. 用例 C：插件上行发送（合法 chat_id）

调用：

```bash
curl -X POST "http://localhost:8099/im-gateway/qixin/message/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {accessToken}" \
  -d '{"chat_id":"0:fs:session-001:","text":"收到"}'
```

期望：

```json
{"code":0,"data":{"message_id":"msg-..."}}
```

## 6. 用例 D：非法 chat_id 返回 40002

调用：

```bash
curl -X POST "http://localhost:8099/im-gateway/qixin/message/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {accessToken}" \
  -d '{"chat_id":"E.fs.7618","text":"test"}'
```

期望：

```json
{"code":40002,"message":"chat_id 格式错误: ..."}
```

## 7. 用例 E：group 透传

调用：

```bash
curl -X POST "http://localhost:8099/bot/message/send" \
  -H "Content-Type: application/json" \
  -d '{
    "env":0,
    "ea":"fs",
    "botFullId":"B.fs.bot001",
    "sessionId":"group-session-001",
    "parentSessionId":"",
    "messageType":"T",
    "chat_type":"group",
    "messageContent":"@bot 这是群消息",
    "senderFullId":"E.fs.9527"
  }'
```

期望插件侧收到 `data.chat_type = "group"`，并能进入群策略分支。

## 8. 用例 F：`user:` 目标映射行为

说明：

1. 先让该用户发过一次 DM（建立 `userId -> chat_id` 映射）。
2. 再执行 `target=user:{userId}` 发送，期望成功。
3. 对未建立映射的用户执行 `target=user:{userId}`，期望报错：

```text
ShareCRM: no known direct chat_id for user ...
```

## 9. 快速回归检查

1. 插件日志不应再出现把 `E.fs.xxx` 当 `chat_id` 发送的行为。
2. Gateway 对 `chat_id` 格式错误不应返回 `50001`。
3. `chat_type=group` 时插件不应按 `direct` 处理。
4. 配对审批通知在无映射时应跳过并记录日志，不应误发。

