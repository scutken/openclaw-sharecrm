package com.fxiaoke.sharecrm.im.gateway.sse;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SSE 协议载荷定义
 */
public final class SsePayloads {

    private SsePayloads() {
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Connected {
        private String type;
        private ConnectedData data;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ConnectedData {
        @JsonProperty("bot_full_id")
        private String botFullId;

        private String version;

        @JsonProperty("max_lifetime")
        private long maxLifetime;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Ping {
        private String type;
        private long time;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ToBotMessage {
        @JsonProperty("message_id")
        private String messageId;

        @JsonProperty("chat_id")
        private String chatId;

        @JsonProperty("chat_type")
        private String chatType;

        private SenderInfo from;
        private String text;
        private Long date;
        private TextMessage message;
        private Long timestamp;
        private Integer env;
        private String ea;

        @JsonProperty("session_id")
        private String sessionId;

        @JsonProperty("parent_session_id")
        private String parentSessionId;

        @JsonProperty("bot_full_id")
        private String botFullId;

        @JsonProperty("message_type")
        private String messageType;

        @JsonProperty("reply_message_id")
        private Long replyMessageId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SenderInfo {
        private String id;
        private String name;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TextMessage {
        private String type;
        private String content;
    }
}
