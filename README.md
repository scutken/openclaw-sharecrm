# OpenClaw ShareCRM 插件

把 OpenClaw 接到纷享销客企信（ShareCRM）。

版本说明见：[CHANGELOG.md](./CHANGELOG.md)

适合：
- 想让 OpenClaw 收企信消息、自动回复
- 已经有 `appId`、`appSecret`

---

## 现在支持什么

- 私聊收发消息
- 按配置接入群聊
- Gateway 1.3 协议
- 自动重连，并持久化 SSE `Last-Event-ID`
- 回复消息时保留 `chat_id`，并带上 `reply_message_id`
- 支持按 `user:<userId>` 发送（前提：插件之前已收到过该用户私聊，已缓存 `chat_id`）
- `userId -> chatId` 映射会持久化保存，插件重启后仍可继续使用

默认安全策略：

- `dmPolicy=pairing`：未知私聊用户需要审批
- `groupPolicy=disabled`：默认不接入群聊
- `requireMention=true`：群聊开启后默认需要 `@Bot`（ID 或 `mentionAliases` 里的企信显示名）

`dmPolicy=open` 只有在 `allowFrom` 包含 `"*"` 时才对所有人开放。

---

## 先准备这些信息

安装前，先确认你手里有：

1. **appId**
2. **appSecret**

额外说明：

- 如果你用的是**专属云环境**，还需要额外准备对应的 `gatewayBaseUrl`
- 如果不是专属云环境，一般不用重点关注这个配置

还需要：

- Node.js `22` 或更高
- 已安装 OpenClaw `v2026.7.1-2` 或更高版本

---

## 安装方式（优先推荐国内更容易完成的方法）

### 方式一：使用 npmmirror 安装（第一推荐）

如果你在国内环境，优先推荐用 npmmirror 安装，不要改全局 npm 源。

```bash
npm --registry=https://registry.npmmirror.com install -g openclaw
openclaw plugins install @openclaw-fs/sharecrm
```

升级时：

```bash
npm --registry=https://registry.npmmirror.com exec -- openclaw plugins update @openclaw-fs/sharecrm
```

如果环境已经能访问 ClawHub，也可以：

```bash
openclaw plugins install clawhub:@openclaw-fs/sharecrm
```

---

### 方式二：本地安装 zip 包

这个方式最稳，通常不依赖国外网络。

拿到发布包后，直接执行：

```bash
openclaw plugins install ./openclaw-sharecrm-v<version>.zip
```

安装器会自动解压。当前发布包里的顶层目录是 `sharecrm/`，其中包含：

- `package.json`
- `dist/sharecrm.js`
- `openclaw.plugin.json`
- `README.md`
- `CHANGELOG.md`

### 方式三：直接 npm 安装（适合已能稳定访问 npm 的环境）

```bash
openclaw plugins install @openclaw-fs/sharecrm
```

如果你的环境已经配置了国内 npm 镜像，也可以直接用现有镜像源安装。

---

## 从旧版迁移到 V1.4（推荐按这个顺序做）

如果你当前装的是 `1.3.x`，推荐先升级 OpenClaw，再装新插件。

### 第一步：先检查 OpenClaw 版本

```bash
openclaw --version
```

V1.4 插件需要 `OpenClaw v2026.7.1-2` 或更高版本，不再兼容 `2026.3.23-2`。

如果版本过旧，先升级 OpenClaw，再继续下面步骤：

```bash
npm --registry=https://registry.npmmirror.com install -g openclaw@latest
```

### 第二步：卸载旧插件目录

Linux / macOS：

```bash
rm -rf ~/.openclaw/extensions/sharecrm
```

Windows（PowerShell）：

```powershell
Remove-Item "$HOME/.openclaw/extensions/sharecrm" -Recurse -Force
```

### 第三步：清理旧插件残留配置

```bash
openclaw doctor --fix
```

如果你之前已经配置过 `channels.sharecrm`，而这时插件还没重新装回去，`doctor` 可能仍提示配置里有旧残留。
这种情况下，先重新安装插件，再执行配置校验即可。

### 第四步：安装 V1.4

```bash
openclaw plugins install @openclaw-fs/sharecrm
```

如果你拿到的是发布 zip，也可以这样装：

```bash
openclaw plugins install ./openclaw-sharecrm-v<version>.zip
```

### 第五步：确认安装成功

```bash
openclaw plugins inspect sharecrm
openclaw config validate
openclaw plugins doctor
```

期望结果：

- `sharecrm` 状态是 `loaded`
- `openclaw config validate` 通过
- `openclaw plugins doctor` 没有插件错误

### 第六步：确认 V1.4 行为

V1.4 主要变化：

- 默认私聊策略改为 `pairing`
- `dmPolicy=open` 必须配合 `allowFrom: ["*"]`
- 群聊仍然默认关闭；开启后默认要求 `@Bot`
- Gateway 协议仍是 `1.3`
- 插件会接收 Gateway 透传的最近群聊历史，帮助 Agent 正确理解上下文后再回复

---

## 旧版本先卸载

如果你之前装过内测版，建议先删掉旧目录：

Linux / macOS：

```bash
rm -rf ~/.openclaw/extensions/sharecrm
```

Windows（PowerShell）：

```powershell
Remove-Item "$HOME/.openclaw/extensions/sharecrm" -Recurse -Force
```

---

## 最简单配置方法

推荐直接用 OpenClaw 交互式配置：

```bash
openclaw onboard
```

或者：

```bash
openclaw configure --section channels
```

看到 ShareCRM 后，填下面 3 个关键项：

- `gatewayBaseUrl`
- `appId`
- `appSecret`

说明：

- `gatewayBaseUrl` 大多数情况下不用重点关注
- **只有专属环境**，才需要改成对应的专属 Gateway 地址

最小配置示例：

```json
{
  "enabled": true,
  "gatewayBaseUrl": "https://open.fxiaoke.com",
  "appId": "your_app_id",
  "appSecret": "your_app_secret",
  "dmPolicy": "pairing"
}
```

---

## 常用配置怎么选

### 只接私聊，未知用户先审批

```json
{
  "enabled": true,
  "gatewayBaseUrl": "https://open.fxiaoke.com",
  "appId": "your_app_id",
  "appSecret": "your_app_secret",
  "dmPolicy": "pairing",
  "groupPolicy": "disabled"
}
```

### 接群聊，但只在被 @ 时回复

```json
{
  "enabled": true,
  "gatewayBaseUrl": "https://open.fxiaoke.com",
  "appId": "your_app_id",
  "appSecret": "your_app_secret",
  "dmPolicy": "pairing",
  "groupPolicy": "open",
  "requireMention": true,
  "mentionAliases": ["小助手"]
}
```

### 只允许白名单私聊

```json
{
  "enabled": true,
  "gatewayBaseUrl": "https://open.fxiaoke.com",
  "appId": "your_app_id",
  "appSecret": "your_app_secret",
  "dmPolicy": "allowlist",
  "allowFrom": ["7618", "8855"]
}
```

### 对所有人开放私聊（不推荐）

```json
{
  "enabled": true,
  "gatewayBaseUrl": "https://open.fxiaoke.com",
  "appId": "your_app_id",
  "appSecret": "your_app_secret",
  "dmPolicy": "open",
  "allowFrom": ["*"]
}
```

### 收到消息先确认，长任务再报进度

私聊默认立刻回一条固定确认；如果 Agent 超过 1 分钟还没开始正式回复，再按 1 / 3 / 6 分钟报进度，之后每 3 分钟一条。

```json
{
  "ack": {
    "enabled": true,
    "messages": "👀已收到，稍后回您！"
  },
  "progress": {
    "enabled": true,
    "scheduleMs": [60000, 180000, 360000],
    "repeatMs": 180000,
    "messages": "⏳仍在工作，已处理 {elapsed}"
  }
}
```

群聊默认只发 Ack。进度文案里的 `{elapsed}` 会替换成已等待时间。若仍配置 `delayMs` + `intervalMs`，则沿用旧的固定间隔算法。

---

## 插件现在怎么工作

插件采用：

- **SSE 下行**：接收 Gateway 推来的 `connected / message / reset`
- **REST 上行**：把回复消息发回 Gateway

Gateway 1.3 下，插件会：

- 建连时带 `version=1.3.0`
- 记住最近一条事件 `id`，重启和重连时通过 `Last-Event-ID` 带回
- 遵循服务端下发的 `retry` 重连等待时间
- 优先读取 `message.content`
- 保留并复用 `chat_id`
- 在服务端给出 `max_lifetime` 时主动重连

补充说明：

- Gateway 的心跳现在使用 **SSE comment**，不会作为业务事件交给插件处理
- 如果服务端返回 `reset`，表示旧事件游标已经失效，插件会清空本地游标后重新建连，并记录日志提示：此前消息可能未被接收
- 同一会话的入站消息会按 `chat_id` 串行处理，避免并发回复互相覆盖
- HTTP 日志会脱敏 `appSecret` / token，不会把密钥打进日志

继续补充：

- 插件对外发消息，本质上仍是通过 `chat_id` 发给企信
- `user:<userId>` 只是插件侧的便捷写法，前提是该用户之前给 Bot 发过私聊消息，插件已经记住了这条会话的 `chat_id`
- 如果插件从未收到过该用户的私聊，单独知道 `userId` 也无法直接发消息

---

## 安装后怎么确认成功

你可以先检查：

1. OpenClaw 能看到 `sharecrm` 插件
2. 配置完成后，插件能正常启动
3. 企信给 Bot 发一条私聊消息；如果是 `pairing`，先审批，再确认 Bot 能回复

如果你在群里启用了：

- `groupPolicy = open`
- `requireMention = true`

那就需要先 `@Bot`，它才会处理消息。

---

## 升级

### npm 安装的升级

```bash
openclaw plugins update @openclaw-fs/sharecrm
```

### zip / 本地文件安装的升级

```bash
openclaw plugins install ./openclaw-sharecrm-v<version>.zip
```

## 常见问题

### 1）连不上 Gateway

先检查：

- `gatewayBaseUrl` 是否正确
- `appId` / `appSecret` 是否正确
- Gateway 是否能访问

### 2）能连上，但收不到消息

先检查：

- 这个 `appId` 是否只保留了一个活跃连接
- Gateway 是否已经把消息转发到该 Bot

### 3）为什么知道 userId 了，还是不能直接发消息？

因为 Gateway 对外发送接口用的是 `chat_id`，不是 `userId`。

如果你想给某个用户发消息，需要先满足下面至少一条：

- 这个用户之前已经给 Bot 发过私聊，插件记住了 `chat_id`
- 你已经通过调试命令拿到了当前会话的 `chat_id`

### 4）怎么快速查看 userId 和 chat_id？

在企信里给 Bot 发送以下命令：

- `/help`：查看 OpenClaw 命令帮助
- `/status`：查看状态
- `!!`：旧调试命令列表（不推荐）
- `!userId`：返回当前用户的 userId
- `!chatId`：返回当前会话的 chat_id

### 5）群里不回复

先检查：

- `groupPolicy` 是否不是 `disabled`
- 如果开了 `requireMention`，是否真的先 `@Bot`
- 企信群聊 @ 的是显示名时，把该名字加到 `mentionAliases`，例如 `["小助手"]`

### 6）为什么陌生人私聊没有自动回复？

V1.4 默认 `dmPolicy=pairing`。未知用户会先收到配对码，需要你在 OpenClaw 里审批后才会开始对话。

如果确实要对所有人开放，把策略改成：

```json
{
  "dmPolicy": "open",
  "allowFrom": ["*"]
}
```

---

## 给维护者

```bash
npm install
npm test
```

发布前建议至少确认：

- 构建通过
- 测试通过
- 私聊收发正常
- 群聊配置行为符合预期
