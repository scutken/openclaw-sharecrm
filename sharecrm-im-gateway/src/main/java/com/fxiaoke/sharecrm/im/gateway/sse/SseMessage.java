package com.fxiaoke.sharecrm.im.gateway.sse;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

/**
 * SSE 消息结构
 */
@Data
@Builder
public class SseMessage {

    /**
     * 消息类型: message, connected, ping, error
     */
    private String type;

    /**
     * 协议版本 (v1.2+)
     */
    private String version;

    /**
     * 消息数据
     */
    private Map<String, Object> data;

    /**
     * 构建消息事件
     */
    public static SseMessage of(String type, Map<String, Object> data) {
        return SseMessage.builder()
                .type(type)
                .data(data)
                .build();
    }

    /**
     * 构建消息事件 (v1.2+ 带版本)
     */
    public static SseMessage of(String type, String version, Map<String, Object> data) {
        return SseMessage.builder()
                .type(type)
                .version(version)
                .data(data)
                .build();
    }
}
