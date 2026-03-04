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
     * 应用ID
     */
    private String appId;

    /**
     * 应用密钥
     */
    private String appSecret;

    /**
     * 企信侧 Bot 完整 ID
     * 格式示例：B.ea.botId
     */
    private String botFullId;

    /**
     * 是否启用，默认启用
     */
    private Boolean enabled = true;
}
