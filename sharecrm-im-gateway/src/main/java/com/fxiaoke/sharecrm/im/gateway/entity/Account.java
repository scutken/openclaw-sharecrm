package com.fxiaoke.sharecrm.im.gateway.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 账号实体
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Account {

    /**
     * 会话所属企业ea
     */
    private String ea;

    /**
     * Gateway 接入应用 ID
     * 用于鉴权、令牌签发与 SSE 连接管理
     */
    private String appId;

    /**
     * Gateway 接入密钥
     */
    private String appSecret;

    /**
     * 企信侧 Bot 完整 ID
     * 格式示例：B.ea.botId
     * 一个 botFullId 可映射到一个 appId，但 appId 允许调整
     */
    private String botFullId;

    /**
     * 是否启用，默认启用
     */
    private Boolean enabled = true;
}
