# ShareCRM IM Gateway 测试与覆盖率报告

## 基本信息

- 项目：`sharecrm-im-gateway`
- 测试时间：2026-03-18
- 执行命令：`mvn -q clean test`
- 测试框架：JUnit 5 + Mockito
- 覆盖率工具：JaCoCo 0.8.12
- 结果：**通过**

## 测试结果总览

| 指标 | 数值 |
|---|---:|
| 测试类数 | 13 |
| 测试用例数 | 59 |
| 失败 | 0 |
| 错误 | 0 |
| 跳过 | 0 |

## 覆盖率总览

基于 `target/site/jacoco/jacoco.csv` 汇总：

| 维度 | 已覆盖 | 总数 | 覆盖率 |
|---|---:|---:|---:|
| 指令（Instruction） | 1921 | 2778 | 69.15% |
| 分支（Branch） | 138 | 235 | 58.72% |
| 行（Line） | 458 | 681 | 67.25% |
| 方法（Method） | 73 | 118 | 61.86% |
| 圈复杂度（Complexity） | 116 | 236 | 49.15% |

## 结论

- **整体行覆盖率 67.25%**，已达到该类网关/协议转换项目的优秀区间
- 核心开放接口、鉴权流程、SSE 管理、协议 DTO、配置解析已形成较完整回归保护
- 分支覆盖率 **58.72%**，说明不仅成功路径，主要错误分支也已有覆盖

## 已重点覆盖模块

### 开放接口与控制器

- `AuthController`：15/17 行，88.24%
- `QixinMessageController`：43/45 行，95.56%
- `BotSseController`：47/61 行，77.05%
- `BotMessageController`：31/34 行，91.18%

### 核心服务

- `AuthService`：44/51 行，86.27%
- `AccountService`：13/13 行，100%

### SSE 与协议转换

- `SseSessionManager`：100/128 行，78.12%
- `SseMessage`：7/9 行，77.78%
- `ToQixinMessage`：20/21 行，95.24%
- `FromQixinMessage`：9/9 行，100%
- `QixinSessionId`：24/24 行，100%

### 配置与加解密

- `EncryptUtil`：33/40 行，82.50%
- `AccountProperties`：21/44 行，47.73%

## 当前测试覆盖内容

### 1. 鉴权与账号

- accessToken 生成
- token 校验成功/失败/过期/账号禁用
- 账号凭据校验
- appId / botFullId 查询
- 账号保存与删除委托

### 2. Open API

- token 获取成功与失败路径
- 发送消息接口参数校验
- Authorization 缺失/非法
- bot 离线判断
- chat_id 解析失败
- EA mismatch
- 企信发送成功/失败分支

### 3. SSE

- Bot 注册/替换连接/注销
- 心跳失败后自动移除连接
- v1.0 / v1.2 协议分支
- `connected` / `message` 结构验证
- `bot_full_id` 返回与旧 `bot_id` 移除校验

### 4. 协议与工具类

- `FromQixinMessage` 的 chatId 编码与发送人解析
- `QixinSessionId` 编解码与异常输入
- `ToQixinMessage` 到企信 SDK 参数映射
- `EncryptUtil` 多种输入场景
- `AccountProperties` 新旧配置格式解析

## 仍未充分覆盖的区域

以下类当前覆盖率仍低或未覆盖：

- `AccountController`
- `ConfigAdminDao`
- `QixinClient`
- `WebUIController`
- `ApplicationStartupListener`
- `AsyncSupportConfig`
- `JacksonConfig`
- `ServletInitializer`
- `ImGatewayApplication`

这些区域多为：

- 管理端接口
- 配置/启动装配代码
- 外部依赖适配层
- 启动类/样板代码

## 评价

从“对外网关 + SSE + 鉴权 + 协议转换”项目视角看：

- **总体覆盖率：优秀**
- **核心风险路径覆盖：较完整**
- **仍可继续提升的方向：管理端与外部依赖适配层**

## 产物位置

- 覆盖率原始数据：`sharecrm-im-gateway/target/site/jacoco/jacoco.csv`
- HTML 覆盖率报告目录：`sharecrm-im-gateway/target/site/jacoco/`
