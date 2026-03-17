package com.fxiaoke.sharecrm.im.gateway.qixin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Locale;

/**
 * 来自企信的消息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FromQixinMessage {
    /**
     * 是否互联：0 企业内，1 互联
     */
    private int env;

    /**
     * 会话所属企业 ea
     */
    private String ea;

    /**
     * 企信侧 Bot 完整 ID
     * 格式示例：B.ea.botId
     * 一个 botFullId 可映射到一个 appId，但 appId 允许调整
     */
    private String botFullId;

    /**
     * 企信对应的会话 ID
     */
    private String sessionId;

    /**
     * 父会话 id
     */
    private String parentSessionId;

    /**
     * 企信侧消息 ID
     */
    private Long messageId;

    /**
     * 消息类型：T(文本), MIX(图文), I(图片), D(文档)
     */
    private String messageType;

    /**
     * 会话类型：direct(私聊) / group(群聊)
     */
    private String chatType;

    /**
     * 消息内容：文本为具体内容；其他类型为 JSON 格式
     */
    private String messageContent;

    /**
     * 消息发送时间戳
     */
    private Long messageTimestamp;

    /**
     * 发送人完整 id，例如：E.ea.employId（如：E.fs.7618）
     */
    private String senderFullId;

    /**
     * 回复的消息 ID
     */
    private Long replyMessageId;

    /**
     * 历史消息：10 条上下文
     */
    private List<SampleMessageInfo> historyMessages;

    /**
     * 发送人的语言环境
     */
    private Locale locale;

    /**
     * 生成编码后的 chatId
     */
    public String encodeChatId() {
        return QixinSessionId.of(env, ea, sessionId, parentSessionId).encode();
    }

    /**
     * 从发送人 ID 提取用户名
     * senderFullId 格式: E.ea.employId
     */
    public String extractUserName() {
        if (senderFullId == null) {
            return "Unknown User";
        }
        String[] parts = senderFullId.split("\\.");
        return parts.length > 2 ? parts[2] : senderFullId;
    }

    /**
     * 从发送人 ID 提取用户名
     * senderFullId 格式: E.ea.employId
     */
    public int extractUserId() {
        if (senderFullId == null) {
            return 0;
        }
        String[] parts = senderFullId.split("\\.");
        return parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
    }

    /**
     * 历史消息摘要
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SampleMessageInfo {
        private long messageId;
        private String messageType;
        private int senderId;
        private String fullSenderId;
        private String content;
        private long messageTimestamp;
    }
}
