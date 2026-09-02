# ShareCRM 插件版本说明

## v1.7.0

发布时间：2026-09-02

Ack / Progress 默认文案改为单句，不再随机抽取：

- Ack：`👀已收到，稍后回您！`
- Progress：`⏳仍在工作，已处理 {elapsed}`，不再带轮次
- 默认时间轴改为 1 / 3 / 6 分钟，之后每 3 分钟一条
- 若仍配置 `delayMs` + `intervalMs`，沿用旧的固定间隔算法

## v1.6.0

发布时间：2026-09-02

基于 1.5.0 的再发布：保持 Gateway `version=1.4.0` 与入站图片落地；兼容 OpenClaw `2026.8.2`。出站仍为纯文本。

## v1.5.0

发布时间：2026-09-01

入站支持 Gateway 1.4 图片 / 图文：建连 `version=1.4.0`，解析 `message.images[].url`，主机下载后写入 OpenClaw `media/inbound` 并填 `MediaPath(s)`，避免沙箱拦截远程 URL。出站仍为纯文本。

## v1.4.8

发布时间：2026-08-31

群聊已开启但 `mentionAliases` 未包含 `@XXX` 显示名时，回固定提示，文案带上检测到的 `@名字`，提醒去 Dashboard 配置 Mention Aliases。

## v1.4.7

发布时间：2026-08-31

群聊被策略拒绝时，如果消息里带了 `@`，回一条固定提示并节流 5 分钟：

- `groupPolicy=disabled`：提示把 Group Policy 改为 open 或 allowlist
- 群不在白名单：提示配置 `groupAllowFrom`
- 需要 @ 但显示名未命中：提示配置 Mention Aliases

## v1.4.6

发布时间：2026-08-31

Dashboard 表单对齐运行时默认值：`requireMention` schema 增加 `"default": true`，未写入配置时开关显示为开启，避免误保存成关闭。

## v1.4.5

发布时间：2026-08-28

群聊 `requireMention` 支持企信显示名：

- 默认仍匹配 `bot_full_id` 和短 ID（如 `@2140`）
- 新增 `mentionAliases`，可填写企信里的 Bot 显示名（如 `小助手`）
- `@显示名` 可在句首或句中命中；不带 `@` 的普通文本不会当成 mention

## v1.4.2

发布时间：2026-08-28

入站确认和长任务进度提示：

- 私聊默认立刻发送一条带表情的 Ack，文案可配置，默认随机抽取
- 若 Agent 超过 20 秒还没开始正式回复，按轮次发送进度，包含已处理时间和第几轮
- 群聊默认只发 Ack，不发 Progress
- 正式回复开始后立即停止进度提示

## v1.4.1

发布时间：2026-08-28

修复 OpenClaw 2026.7 启动崩溃：

- 不再把 `runtime.error` 当成函数调用（`error2 is not a function`）
- 启动时不再依赖尚未注入的 plugin runtime 去读状态目录
- 绑定缓存/SSE 游标在 runtime 未就绪时也能落到 `~/.openclaw/sharecrm`

## v1.4.0

发布时间：2026-08-28

对齐 OpenClaw `v2026.7.1-2` 当前渠道插件契约，不再兼容 `2026.3.23-2`，并收紧默认安全策略：

- `openclaw` 改为 peerDependency，补齐 `compat` / `runtimeExtensions` / `activation`
- `openclaw.plugin.json` 把渠道 schema 放到 `channelConfigs`，`appSecret` 标记为敏感字段
- 默认 `dmPolicy=pairing`；`open` 只有 `allowFrom` 含 `*` 才对所有人开放
- 白名单只匹配稳定 userId，不再按显示名匹配
- 向导改为 merge-patch，不再覆盖已有群聊/多账号配置
- 入站按 `chat_id` 串行处理，忽略 Bot 自己发出的消息
- 持久化 SSE `Last-Event-ID`，HTTP 日志脱敏
- 群聊默认 `requireMention=true`，回复会带上 `reply_message_id`

## v1.3.5-beta.0

适配 OpenClaw `v2026.3.23-2` 的 Gateway 1.3 协议，并支持群聊。

## v1.3.0

发布时间：2026-03-24

本版本主要包含两点：

- 适配 OpenClaw `v2026.3.23-2`
- 支持群聊
