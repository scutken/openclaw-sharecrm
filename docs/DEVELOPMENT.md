# 开发文档

## 在 OpenClaw 中安装插件

### 方式一：通过 Git 安装（推荐）

```bash
# 1. 克隆插件到 OpenClaw extensions 目录
git clone git@github.com:scutken/openclaw-sharecrm.git ~/.openclaw/extensions/sharecrm

# 2. 安装依赖并编译
cd ~/.openclaw/extensions/sharecrm
npm install
npm run build

# 3. 重启 OpenClaw Gateway
openclaw gateway restart
```

### 方式二：使用 OpenClaw CLI 链接安装

```bash
# 1. 克隆到任意目录
git clone git@github.com:scutken/openclaw-sharecrm.git ~/plugins/sharecrm

# 2. 安装依赖并编译
cd ~/plugins/sharecrm
npm install
npm run build

# 3. 使用 link 模式安装（不复制文件，便于开发）
openclaw plugins install -l ~/plugins/sharecrm

# 4. 重启 Gateway
openclaw gateway restart
```

### 方式三：本地路径安装

```bash
# 复制插件到 extensions 目录
openclaw plugins install ~/plugins/sharecrm

# 重启 Gateway
openclaw gateway restart
```

---

## 更新插件

```bash
# 进入插件目录
cd ~/.openclaw/extensions/sharecrm

# 拉取最新代码
git pull

# 重新编译
npm run build

# 重启 Gateway
openclaw gateway restart
```

---

## 配置插件

在 `~/.openclaw/openclaw.json` 中添加配置：

```json
{
  "channels": {
    "sharecrm": {
      "enabled": true,
      "gatewayUrl": "ws://localhost:18789",
      "botToken": "Base64编码的appId:appSecret",
      "chatId": "default-chat-id",
      "dmPolicy": "open",
      "allowFrom": []
    }
  }
}
```

### Token 生成

```bash
# Linux/macOS
echo -n "appId:appSecret" | base64

# 示例：appId=bot001, appSecret=secret123
echo -n "bot001:secret123" | base64
# 输出：Ym90MDAxOnNlY3JldDEyMw==
```

### 配置项说明

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `enabled` | boolean | 否 | 是否启用，默认 true |
| `gatewayUrl` | string | 是 | Gateway WebSocket 地址 |
| `botToken` | string | 是 | Base64(appId:appSecret) |
| `chatId` | string | 否 | 默认发送目标 |
| `dmPolicy` | string | 否 | DM 策略：open/pairing/allowlist/disabled |
| `allowFrom` | string[] | 否 | 允许的用户 ID 列表 |

---

## 验证安装

```bash
# 查看已安装插件
openclaw plugins list

# 查看插件信息
openclaw plugins info sharecrm

# 检查插件状态
openclaw plugins doctor
```

---

## 测试连接

### 命令行测试

```bash
# 测试 Gateway 健康检查
curl http://localhost:18789/api/ping

# 预期响应
# {"status":"ok","service":"sharecrm-im-gateway","timestamp":1709345678000}
```

---

## 编程接口

### 导入

```typescript
import { 
  shareCrmChannel,
  ShareCrmClient,
  ShareCrmConfigSchema,
} from 'openclaw-sharecrm';
```

### 使用客户端

```typescript
import { ShareCrmClient } from 'openclaw-sharecrm';

const client = new ShareCrmClient({
  gatewayUrl: "ws://localhost:18789",
  botToken: "Ym90MDAxOnNlY3JldDEyMw==",
  onMessage: (event) => {
    console.log(`收到消息: ${event.text}`);
  },
  onConnected: (info) => {
    console.log(`已连接: ${info.result?.bot_name}`);
  },
  onDisconnected: (reason) => {
    console.log(`断开连接: ${reason}`);
  },
});

// 连接
client.connect();

// 发送消息
const result = await client.sendMessage("user-1001", "Hello!");
if (result.ok) {
  console.log(`发送成功: ${result.result?.message_id}`);
}

// 断开
client.disconnect();
```

---

## 协议说明

### WebSocket 连接

```
ws://{gatewayUrl}/bot{token}
```

Token 内置于 URL，连接成功即完成鉴权。

### 消息格式

#### 1. 连接成功（Gateway → Plugin）

```json
{
  "type": "connected",
  "data": {
    "bot_id": "bot001",
    "bot_name": "ShareCRM Bot"
  }
}
```

#### 2. 收到新消息（Gateway → Plugin）

```json
{
  "type": "message",
  "data": {
    "message_id": "msg-789",
    "chat_id": "user-1001",
    "chat_type": "direct",
    "from": {
      "id": "user-1001",
      "name": "张三"
    },
    "text": "你好",
    "date": 1709366400
  }
}
```

#### 3. 发送消息（Plugin → Gateway）

```json
{
  "type": "send",
  "id": "req-001",
  "data": {
    "chat_id": "user-1001",
    "text": "你好！"
  }
}
```

#### 4. 发送响应（Gateway → Plugin）

```json
{
  "type": "send_result",
  "id": "req-001",
  "ok": true,
  "data": {
    "message_id": "msg-456"
  }
}
```

#### 5. 错误响应

```json
{
  "type": "error",
  "id": "req-001",
  "error": {
    "code": "INVALID_CHAT_ID",
    "message": "无效的 chat_id"
  }
}
```

### 消息类型汇总

| 类型 | 方向 | 说明 |
|------|------|------|
| `connected` | ← Server | 连接成功，返回 Bot 信息 |
| `message` | ← Server | 收到新消息 |
| `send` | → Server | 发送消息请求 |
| `send_result` | ← Server | 发送成功响应 |
| `error` | ← Server | 错误响应 |

---

## 架构

```
OpenClaw
└── openclaw-sharecrm
    ├── api.ts           (WebSocket 客户端)
    ├── channel.ts       (Channel 插件入口)
    ├── config-schema.ts (Zod 配置验证)
    └── runtime.ts       (运行时单例)
            │
            │ WebSocket (双向通信)
            ▼
    ShareCRM-IM-Gateway
    ws://host:18789/bot{token}
```

---

## 连接管理

### 自动重连

- 断开后 3 秒自动重连
- 使用 WebSocket 原生 ping/pong 心跳

### 发送超时

- 默认 10 秒超时
- 超时后返回 `{ ok: false, error: "发送超时" }`

---

## 错误排查

| 错误 | 原因 | 解决 |
|------|------|------|
| 连接失败 | Token 无效 | 检查 botToken 格式（Base64 编码） |
| 未连接 | 连接断开 | 等待自动重连或检查 Gateway |
| 发送超时 | Gateway 无响应 | 检查 Gateway 状态和网络 |
| 配置不完整 | 缺少必填项 | 检查 gatewayUrl 和 botToken |

---

## 与旧版本对比

| 对比项 | 旧版本 | 新版本 |
|--------|--------|--------|
| 鉴权方式 | 连接后发 AUTH 消息 | Token 内置 URL |
| 消息类型 | 8 种 | 5 种 |
| 心跳 | 自定义 ping/pong | WebSocket 原生 |
| 文件数 | 8 个 | 4 个 |
| 配置项 | appId + appSecret | botToken |
