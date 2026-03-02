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

```json5
{
  channels: {
    sharecrm: {
      enabled: true,
      gatewayUrl: "ws://localhost:8099/ws/gateway",
      appId: "your-app-id",
      appSecret: "your-app-secret",
      dmPolicy: "pairing",
      allowFrom: [],
      groupPolicy: "allowlist",
      groupAllowFrom: []
    }
  }
}
```

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

## 编程接口

### 导入

```typescript
import { 
  shareCrmPlugin,
  sendText,
  replyMessage,
  getAccountState,
} from 'openclaw-sharecrm';
```

### 发送消息

```typescript
import { sendText, replyMessage } from 'openclaw-sharecrm';

// 发送文本
await sendText('channel-id', 'Hello!');

// 回复消息
await replyMessage('channel-id', '回复内容', 'original-msg-id');
```

### 监控状态

```typescript
import { getAccountState, getAllAccountStates } from 'openclaw-sharecrm';

const state = getAccountState('default');
console.log(state?.connected);
console.log(state?.lastError);
```

### 手动控制连接

```typescript
import { startAccountMonitor, stopAccountMonitor } from 'openclaw-sharecrm';

const controller = new AbortController();
await startAccountMonitor(account, controller.signal);

// 停止
stopAccountMonitor('default');
```

---

## 协议说明

### 消息信封

```json
{
  "type": "message.new",
  "seq": 1,
  "ts": 1709345678000,
  "payload": { ... }
}
```

### 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `auth` | → Server | 鉴权请求 |
| `auth.ok` | ← Server | 鉴权成功 |
| `auth.error` | ← Server | 鉴权失败 |
| `system.ping` | ← Server | 心跳检测 |
| `system.pong` | → Server | 心跳响应 |
| `message.new` | ← Server | 新消息 |
| `command.sendMessage` | → Server | 发送消息 |
| `command.ack` | ← Server | 命令确认 |

### 新消息载荷

```json
{
  "chatType": "direct",
  "channelId": "user123",
  "messageId": "msg001",
  "from": { "userId": "user123", "name": "张三" },
  "text": "你好",
  "mentions": []
}
```

---

## 消息上下文

```typescript
interface ShareCrmMessageContext {
  accountId: string;
  chatType: 'direct' | 'group';
  channelId: string;
  messageId: string;
  from: { userId: string; name: string };
  text: string;
  mentions: string[];
  sessionKey: string;
}
```

---

## 连接管理

### 自动重连
- 最大重试：10 次
- 重试间隔：1s → 2s → 5s → 10s

### 高级配置

```typescript
import { ConnectionConfig } from 'openclaw-sharecrm';

const config: Partial<ConnectionConfig> = {
  authTimeoutMs: 10000,
  heartbeatIntervalMs: 30000,
  reconnectDelays: [1000, 2000, 5000, 10000],
  maxReconnectAttempts: 10,
};
```

---

## 架构

```
OpenClaw
└── openclaw-sharecrm
    ├── channel.ts    (入口)
    ├── monitor.ts    (连接管理)
    ├── client.ts     (WebSocket)
    ├── bot.ts        (入站)
    ├── outbound.ts   (出站)
    └── accounts.ts   (账号)
            │
            │ WebSocket
            ▼
    ShareCRM-IM-Gateway
    ws://host:8099/ws/gateway
```

---

## 错误排查

| 错误 | 原因 | 解决 |
|------|------|------|
| 鉴权超时 | Gateway 无响应 | 检查地址和网络 |
| 鉴权失败 | 凭证错误 | 核实 appId/appSecret |
| 未连接 | 连接断开 | 等待重连或检查 Gateway |
| 重连失败 | 超过重试上限 | 检查 Gateway 状态 |
