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

**方式二：从 GitHub Release 下载安装**

1. 前往 [Releases](https://github.com/scutken/openclaw-sharecrm/releases) 页面
2. 下载最新版本的 `openclaw-sharecrm-vX.X.X.zip`
3. 解压到 OpenClaw 的 extensions 目录：

```shell
unzip openclaw-sharecrm-vX.X.X.zip -d /path/to/openclaw/extensions/sharecrm
```

### 3. 更新插件

**npm 方式安装的更新：**

```shell
openclaw plugins update @scut_ken/openclaw-sharecrm
```

**GitHub Release 方式安装的更新：**

1. 前往 [Releases](https://github.com/scutken/openclaw-sharecrm/releases) 页面
2. 下载最新版本
3. 删除旧版本目录后重新解压

### 4. 配置

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

## 发布流程

维护者发布新版本：

1. 更新 `package.json` 中的版本号
2. 创建并推送 tag：`git tag v1.0.3 && git push origin v1.0.3`
3. GitHub Actions 自动构建并发布到 npm 和 GitHub Releases

> **注意**：需要在 GitHub 仓库设置中添加 `NPM_TOKEN` secret（从 npm 获取 automation token）
