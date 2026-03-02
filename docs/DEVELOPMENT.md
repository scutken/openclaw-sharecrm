# 开发文档

## 开发环境安装

### 基于 Git 拉取测试（推荐）

在 OpenClaw 服务器上通过 Git 拉取插件进行测试：

```bash
# 1. 克隆插件仓库到 OpenClaw 服务器
cd /path/to/openclaw-server
git clone <仓库地址> ./plugins/sharecrm-ai-bot

# 2. 编译插件
cd ./plugins/sharecrm-ai-bot/openclaw-sharecrm
npm install
npm run build

# 3. 在 OpenClaw 项目中添加本地依赖
# 编辑 package.json
{
  "dependencies": {
    "openclaw-sharecrm": "file:./plugins/sharecrm-ai-bot/openclaw-sharecrm"
  }
}

# 4. 安装依赖
cd /path/to/openclaw-server
npm install

# 5. 重启 OpenClaw 服务
```

### 更新插件

```bash
# 拉取最新代码
cd ./plugins/sharecrm-ai-bot
git pull

# 重新编译
cd openclaw-sharecrm
npm run build

# 重启 OpenClaw 服务
```

### npm link 方式（本地开发）

```bash
# 在插件目录创建全局链接
cd openclaw-sharecrm
npm link

# 在 OpenClaw 项目中链接
cd <openclaw项目>
npm link openclaw-sharecrm
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
