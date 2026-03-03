# ShareCRM OpenClaw 插件开发说明

本文档面向插件开发者，介绍项目结构、核心模块及开发调试指南。

## 项目结构

```
openclaw-sharecrm/
├── index.ts                 # 插件入口，注册 channel 插件
├── src/
│   ├── types.ts            # 类型定义（消息协议、配置接口）
│   ├── client.ts           # WebSocket 客户端（连接、重连、消息收发）
│   ├── accounts.ts         # 账号配置解析
│   ├── channel.ts          # ChannelPlugin 实现（OpenClaw 渠道接口）
│   ├── monitor.ts          # Gateway 监控（消息分发、会话管理）
│   └── runtime.ts          # 运行时单例
├── package.json
└── README.md
```

## 开发环境

### 依赖安装

```bash
npm install
npm install --save-dev @types/node  # 解决 process 类型错误
```

### 技术栈

| 技术 | 说明 |
|------|------|
| TypeScript | ESM 模块（`"type": "module"`） |
| WebSocket (ws) | 与 IM Gateway 通信 |
| Zod | 配置校验（待实现） |
| OpenClaw Plugin SDK | 插件框架接口 |

## 核心模块说明

### 1. types.ts - 类型定义

定义了与 IM Gateway 通信的消息协议：

```typescript
// 服务端 → 插件
ShareCrmConnectedMessage   // 连接成功
ShareCrmMessageEvent       // 用户消息
ShareCrmSendResult         // 发送结果
ShareCrmErrorMessage       // 错误

// 插件 → 服务端
ShareCrmSendRequest        // 发送消息请求

// 配置
ShareCrmChannelConfig      // 渠道配置
ResolvedShareCrmAccount    // 解析后的账号配置
```

### 2. client.ts - WebSocket 客户端

`ShareCrmClient` 类负责：
- WebSocket 连接管理
- 消息序列化/反序列化
- 请求-响应匹配（通过 `id` 字段）
- 断线自动重连（固定 3 秒延迟）

**关键方法：**

```typescript
connect()                    // 建立连接
sendMessage(chatId, text)    // 发送消息，返回 Promise
disconnect()                 // 断开并停止重连
```

### 3. accounts.ts - 账号解析

支持单账号和多账号配置：

```typescript
listAccountIds(cfg)          // 列出所有账号 ID
resolveAccount(cfg, id)      // 解析指定账号的完整配置
listEnabledAccounts(cfg)     // 列出所有已启用账号
```

**配置优先级：** 账号覆盖 > 渠道配置 > 环境变量

### 4. channel.ts - 渠道插件

实现 `ChannelPlugin<ResolvedShareCrmAccount>` 接口，包含：

| 能力 | 说明 |
|------|------|
| `meta` | 渠道元信息 |
| `pairing` | 配对审批流程 |
| `capabilities` | 支持的功能（目前仅支持 text） |
| `config` | 配置管理方法 |
| `security` | 安全警告收集 |
| `messaging` | 消息目标解析 |
| `outbound` | 出站消息发送 |
| `gateway` | 启动账号监控 |

### 5. monitor.ts - 消息监控器

核心消息处理流程：

```
Gateway 消息 → handleInboundMessage()
    ├── 私聊策略检查（dmPolicy）
    ├── 群聊策略检查（groupPolicy）
    ├── 会话路由解析
    ├── 构建 Agent 上下文
    └── 分发到 Agent 并处理回复
```

**全局状态：**
- `activeClients`: 各账号的活跃客户端 Map
- `botInfo`: 各账号的 Bot 信息 Map

## 开发指南

### 添加新消息类型

1. 在 `types.ts` 中定义消息接口
2. 更新 `ShareCrmServerMessage` 联合类型
3. 在 `client.ts` 的 `handleMessage()` 中添加处理分支

### 添加新配置项

1. 在 `ShareCrmChannelConfig` 中添加字段
2. 在 `channel.ts` 的 `configSchema.schema` 中添加校验
3. 在 `accounts.ts` 的 `resolveAccount()` 中处理默认值

### 修改私聊/群聊策略

在 `monitor.ts` 的 `handleInboundMessage()` 中修改：
- 私聊策略检查逻辑（约第 74-116 行）
- 群聊策略检查逻辑（约第 119-135 行）

## 调试技巧

### 日志输出

所有日志以 `sharecrm:` 或 `sharecrm[accountId]:` 为前缀，方便过滤：

```bash
# 过滤 ShareCRM 相关日志
grep "sharecrm" logs.txt
```

### 常见问题

| 问题 | 排查方向 |
|------|----------|
| 连接失败 | 检查 `gatewayUrl` 和 `botToken` 配置 |
| 消息未收到 | 检查 `dmPolicy` / `groupPolicy` 设置 |
| 发送超时 | 检查网络连通性，默认超时 10 秒 |
| 认证失败 | 确认 `botToken` 是正确的 Base64 编码 |

### 本地测试

1. 启动 IM Gateway（默认 `ws://localhost:8099`）
2. 配置 `openclaw.yaml` 中的 `channels.sharecrm`
3. 启动 OpenClaw Agent

## 待优化项

- [ ] 使用 Zod 进行配置运行时校验
- [ ] 实现指数退避重连策略
- [ ] 添加消息发送重试机制
- [ ] 限制群聊历史内存占用
- [ ] 增加结构化日志和 metrics

## 相关文档

- [README.md](./README.md) - 用户使用文档
- [IM Gateway API](../sharecrm-im-gateway/docs/PLUGIN_API.md) - WebSocket 协议规范
