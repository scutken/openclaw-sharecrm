> [!IMPORTANT]
> 内测中，暂不对外提供使用

# 🦞OpenClaw 纷享销客插件

将你的 OpenClaw接入 纷享销客（ShareCRM）企信 。内测中，暂不可使用。

## 概述

本插件通过 WebSocket 纷享销客（ShareCRM）企信

## 特性

- [X] 接收并回复 ShareCRM 用户的私聊消息
- [X] 断线自动重连
- [ ] 参与群组聊天

## 快速开始

### 1. 安装插件

**方式一：使用预构建包（推荐）**

下载 `openclaw-sharecrm-v1.0.0.zip` 并解压到 OpenClaw 的 extensions 目录：

```shell
# 解压到 openclaw extensions 目录
unzip openclaw-sharecrm-v1.0.0.zip -d /path/to/openclaw/extensions/sharecrm
```

**方式二：本地开发安装**

```shell
# 克隆项目到openclaw的机器上
git clone https://github.com/scutken/openclaw-sharecrm.git
cd openclaw-sharecrm
npm install
npm run build
# 安装插件，链接方式
openclaw plugins install -l .
```

### 2. 配置

cli交互式配置

```shell
# 方式 A：使用 onboard 命令
openclaw onboard
# 方式 B：直接配置 channels 部分
openclaw configure --section channels
```

或者在Gateway Dashboard 上面进行配置

## 配置内容

目前需要由 IM-Gatway 服务负责人提供

{
  "gatewayUrl": "wss://open.ceshi112.com",
  "apiBaseUrl": "https://open.ceshi112.com",
  "appId": "bot-qqq111",
  "appSecret": "__OPENCLAW_REDACTED__",
  "enabled": true
}

## 协议

完整协议参阅 [ShareCRM IM Gateway API 文档](./GATEWAY_API.md)。