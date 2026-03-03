package com.fxiaoke.sharecrm.im.gateway.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;

import java.time.LocalDateTime;

/**
 * 账号实体
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table("accounts")
public class Account {

    @Id
    @Column("id")
    private Long id;

    @Column("app_id")
    private String appId;

    @Column("app_secret")
    private String appSecret;

    @Column("bot_name")
    private String botName;

    @Column("enabled")
    private Boolean enabled;

    @Column("created_at")
    private LocalDateTime createdAt;

    @Column("updated_at")
    private LocalDateTime updatedAt;
}
