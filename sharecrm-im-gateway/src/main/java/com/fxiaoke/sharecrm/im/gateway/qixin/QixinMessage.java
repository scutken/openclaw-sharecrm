package com.fxiaoke.sharecrm.im.gateway.qixin;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Locale;

/**
 * 企信消息定义
 */
public class QixinMessage {

    /**
     * 企信发送给网关的消息（下行/接收）
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InboundMessage {
        /**
         * 是否互联：0 企业内，1 互联
         */
        private int env;

        /**
         * 会话所属企业 ea
         */
        private String ea;

        /**
         * 需要响应这个消息的 botId
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
                return "未知用户";
            }
            String[] parts = senderFullId.split("\\.");
            return parts.length > 2 ? parts[2] : senderFullId;
        }
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

    /**
     * 企信接口响应
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Response {
        private int code;
        private String message;

        public static Response success() {
            return Response.builder().code(0).message("success").build();
        }


        public static Response error(int code, String message) {
            return Response.builder().code(code).message(message).build();
        }
    }
}
