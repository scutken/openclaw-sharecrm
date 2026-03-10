> [!IMPORTANT]
> 内测中，暂不对外提供使用

# 🦞OpenClaw 纷享销客插件

将 OpenClaw 接入纷享销客（ShareCRM）企信。

## 概述

本插件采用 **SSE 下行 + REST 上行** 与 ShareCRM IM Gateway 通信：

- SSE：接收消息与连接事件
- REST：发送回复消息

## 特性

- [X] 接收并回复 ShareCRM 用户的私聊消息
- [X] 断线自动重连
- [ ] 参与群组聊天

## 快速开始

### 1. 环境准备

- Node.js `>=20`
- OpenClaw（目标运行环境）

### 2. 安装插件

**方式一：通过 npm 安装（推荐）**

```shell
openclaw plugins install @scut_ken/openclaw-sharecrm
```

### 3. 配置

CLI 交互式配置：

```shell
# 方式 A：使用 onboard 命令
openclaw onboard
# 方式 B：直接配置 channels 部分
openclaw configure --section channels
```

或者在Gateway Dashboard 上面进行配置

## 配置内容

```json
{
  "gatewayBaseUrl": "https://open.fxiaoke.com",
  "appId": "bot-qqq111",
  "appSecret": "__OPENCLAW_REDACTED__",
  "dmPolicy": "pairing",
  "enabled": true
}
```