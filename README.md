# OpenClaw ShareCRM 插件

通过 ShareCRM-IM-Gateway 接入内部 IM 的 OpenClaw 渠道插件。

## 特性

- 纯 WebSocket 双向通信
- Token 内置 URL，连接即鉴权
- 简洁的消息协议（5 种消息类型）
- 自动重连机制

## 安装

```bash
npm install openclaw-sharecrm
```

## 配置

```json
{
  "channels": {
    "sharecrm": {
      "enabled": true,
      "gatewayUrl": "ws://localhost:18789",
      "botToken": "Base64编码的appId:appSecret",
      "chatId": "default-chat-id",
      "dmPolicy": "open"
    }
  }
}
```

### 生成 botToken

```bash
# botToken = Base64(appId:appSecret)
echo -n "your-app-id:your-app-secret" | base64
```

### 获取 AppId 和 AppSecret

1. 访问 ShareCRM-IM-Gateway：`http://localhost:18789/accounts`
2. 创建账号，复制 `appId` 和 `appSecret`
3. 生成 botToken：`Base64(appId:appSecret)`

### 配置项说明

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `enabled` | boolean | 否 | 是否启用，默认 true |
| `gatewayUrl` | string | 是 | Gateway WebSocket 地址 |
| `botToken` | string | 是 | Base64(appId:appSecret) |
| `chatId` | string | 否 | 默认发送目标 |
| `dmPolicy` | string | 否 | DM 策略 |
| `allowFrom` | string[] | 否 | 允许的用户 ID 列表 |

### DM 策略 (dmPolicy)

| 值 | 说明 |
|------|------|
| `open` | 接受所有私聊（推荐测试） |
| `pairing` | 自动配对模式 |
| `allowlist` | 仅白名单用户 |
| `disabled` | 禁用私聊 |

## 测试

使用 Gateway 模拟器测试消息：`http://localhost:18789/simulator`

## 快速开始

```typescript
import { ShareCrmClient } from 'openclaw-sharecrm';

const client = new ShareCrmClient({
  gatewayUrl: "ws://localhost:18789",
  botToken: "Ym90MDAxOnNlY3JldDEyMw==",
  onMessage: (event) => console.log(`收到: ${event.text}`),
  onConnected: (info) => console.log(`已连接: ${info.result?.bot_name}`),
  onDisconnected: (reason) => console.log(`断开: ${reason}`),
});

client.connect();

// 发送消息
await client.sendMessage("user-1001", "Hello!");
```

## 文档

- [开发文档](./docs/DEVELOPMENT.md) - 安装、配置、协议说明、编程接口

## 许可证

MIT License
