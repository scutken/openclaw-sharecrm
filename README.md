# ShareCRM IM Gateway 渠道插件（OpenClaw）

通过 ShareCRM IM Gateway 将你的 OpenClaw Agent 接入 ShareCRM 即时通讯。

## 概述

本插件通过 WebSocket 连接 ShareCRM IM Gateway，支持以下功能：

- 接收并回复 ShareCRM 用户的私聊消息
- 参与群组聊天
- 断线自动重连
- 支持私聊配对 / 白名单策略

## 快速开始

### 1. 安装插件

在 `openclaw.yaml` 中添加扩展：

```yaml
extensions:
  - ./extensions/sharecrm
```

### 2. 配置渠道

```yaml
channels:
  sharecrm:
    gatewayUrl: "ws://localhost:8099"          # ShareCRM IM Gateway WebSocket 地址
    botToken: "Ym90LTAwMTpzZWNyZXQxMjM="      # Base64(appId:appSecret)
    dmPolicy: "open"                            # open | pairing | allowlist | disabled
    allowFrom: []                               # 白名单用户 ID（dmPolicy=allowlist 时生效）
```

### 3. 生成 Bot Token

`botToken` 是 `appId:appSecret` 的 Base64 编码字符串：

```bash
echo -n "bot-001:secret123" | base64
# 输出: Ym90LTAwMTpzZWNyZXQxMjM=
```

## 配置参考


| 选项             | 类型     | 默认值       | 说明                                                                                   |
| ---------------- | -------- | ------------ | -------------------------------------------------------------------------------------- |
| `gatewayUrl`     | string   | 必填         | IM Gateway 的 WebSocket 地址                                                           |
| `botToken`       | string   | 必填         | Base64 编码的`appId:appSecret`                                                         |
| `dmPolicy`       | string   | `"open"`     | 私聊策略：`open`（开放）、`pairing`（配对）、`allowlist`（白名单）、`disabled`（禁用） |
| `allowFrom`      | string[] | `[]`         | 白名单用户 ID 列表（`dmPolicy=allowlist` 时使用）                                      |
| `groupPolicy`    | string   | `"disabled"` | 群聊策略：`open`、`allowlist`、`disabled`                                              |
| `groupAllowFrom` | string[] | `[]`         | 白名单群组 ID 列表                                                                     |
| `chatId`         | string   | -            | 固定回复的会话 ID                                                                      |
| `historyLimit`   | number   | `10`         | 群聊历史消息上限                                                                       |
| `textChunkLimit` | number   | `4000`       | 单条消息最大字符数                                                                     |

### 多账号配置

```yaml
channels:
  sharecrm:
    gatewayUrl: "ws://gateway1:8099"
    botToken: "..."
    accounts:
      sales-bot:
        gatewayUrl: "ws://gateway2:8099"
        botToken: "..."
```

### 环境变量


| 变量                   | 说明               |
| ---------------------- | ------------------ |
| `SHARECRM_GATEWAY_URL` | Gateway URL 回退值 |
| `SHARECRM_BOT_TOKEN`   | Bot Token 回退值   |

## 架构

```
ShareCRM 用户 ←→ ShareCRM 服务器 ←→ IM Gateway ←→ [WebSocket] ←→ OpenClaw 插件 ←→ Agent
```

插件与 ShareCRM IM Gateway 维持持久的 WebSocket 连接，消息双向流动：

1. **入站**：Gateway 推送用户消息 → 插件分发到 Agent 会话
2. **出站**：Agent 回复 → 插件通过 WebSocket 发送 → Gateway 投递给用户

连接使用 WebSocket 原生 ping/pong 保活，断线后自动重连（延迟 3 秒）。

## 协议

完整 WebSocket 协议规范请参阅 [ShareCRM IM Gateway API 文档](./GATEWAY_API.md)。
