# OpenClaw ShareCRM 插件

通过 ShareCRM-IM-Gateway 接入内部 IM 的 OpenClaw 渠道插件。

## 安装

```bash
npm install openclaw-sharecrm
```

## 配置

```yaml
channels:
  sharecrm:
    enabled: true
    gatewayUrl: "ws://localhost:8099/ws/gateway"
    appId: "your-app-id"
    appSecret: "your-app-secret"
    dmPolicy: "pairing"           # 私聊策略: open | pairing | allowlist
    allowFrom: []                 # 私聊白名单
    groupPolicy: "allowlist"      # 群聊策略: open | allowlist | disabled
    groupAllowFrom: []            # 群聊白名单
```

### 获取 AppId 和 AppSecret

1. 访问 ShareCRM-IM-Gateway：`http://localhost:8099/accounts`
2. 创建账号，复制 `appId` 和 `appSecret`

### 策略说明

**私聊策略 (dmPolicy)**
| 值 | 说明 |
|------|------|
| `open` | 接受所有私聊 |
| `pairing` | 自动配对模式（默认） |
| `allowlist` | 仅白名单用户 |

**群聊策略 (groupPolicy)**
| 值 | 说明 |
|------|------|
| `open` | 接受所有群消息 |
| `allowlist` | 仅白名单群（默认） |
| `disabled` | 禁用群消息 |

## 测试

使用 Gateway 模拟器测试消息：`http://localhost:8099/simulator`

## 文档

- [开发文档](./docs/DEVELOPMENT.md) - 开发测试、编程接口、协议说明

## 许可证

MIT License
