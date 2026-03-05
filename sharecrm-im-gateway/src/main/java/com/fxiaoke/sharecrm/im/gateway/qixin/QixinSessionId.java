package com.fxiaoke.sharecrm.im.gateway.qixin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 企信 SessionId 编解码工具
 * 
 * 将 env, ea, sessionId, parentSessionId 拼接为统一的 chat_id 格式，并支持反解析
 * 格式: {env}:{ea}:{sessionId}:{parentSessionId}
 * 示例: 0:fs:session123:parent456
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QixinSessionId {

    /**
     * 是否互联：0 企业内，1 互联
     */
    private int env;

    /**
     * 会话所属企业 ea
     */
    private String ea;

    /**
     * 企信对应的会话 ID
     */
    private String sessionId;

    /**
     * 父会话 id（可为空）
     */
    private String parentSessionId;

    /**
     * 分隔符
     */
    private static final String SEPARATOR = ":";

    /**
     * 编码为 chat_id 字符串
     * 格式: {env}:{ea}:{sessionId}:{parentSessionId}
     */
    public String encode() {
        return String.join(SEPARATOR,
                String.valueOf(env),
                ea != null ? ea : "",
                sessionId != null ? sessionId : "",
                parentSessionId != null ? parentSessionId : ""
        );
    }

    /**
     * 从 chat_id 字符串解码
     * 
     * @param chatId 编码后的 chat_id
     * @return QixinSessionId 对象
     * @throws IllegalArgumentException 如果格式不正确
     */
    public static QixinSessionId decode(String chatId) {
        if (chatId == null || chatId.isEmpty()) {
            throw new IllegalArgumentException("chatId cannot be null or empty");
        }

        String[] parts = chatId.split(SEPARATOR, 4);
        if (parts.length < 3) {
            throw new IllegalArgumentException("chatId format error: " + chatId);
        }

        try {
            return QixinSessionId.builder()
                    .env(Integer.parseInt(parts[0]))
                    .ea(parts[1].isEmpty() ? null : parts[1])
                    .sessionId(parts[2].isEmpty() ? null : parts[2])
                    .parentSessionId(parts.length > 3 && !parts[3].isEmpty() ? parts[3] : null)
                    .build();
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("env must be a number: " + parts[0]);
        }
    }

    /**
     * 快速创建 QixinSessionId
     */
    public static QixinSessionId of(int env, String ea, String sessionId, String parentSessionId) {
        return QixinSessionId.builder()
                .env(env)
                .ea(ea)
                .sessionId(sessionId)
                .parentSessionId(parentSessionId)
                .build();
    }
}
