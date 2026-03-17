package com.fxiaoke.sharecrm.im.gateway.sse;

import lombok.Data;

/**
 * SSE 消息结构
 */
@Data
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
    private Object data;

    public SseMessage() {
    }

    public SseMessage(String type, String version, Object data) {
        this.type = type;
        this.version = version;
        this.data = data;
    }

    /**
     * 构建消息事件
     */
    public static SseMessage of(String type, Object data) {
        return new SseMessage(type, null, data);
    }

    /**
     * 构建消息事件 (v1.2+ 带版本)
     */
    public static SseMessage of(String type, String version, Object data) {
        return new SseMessage(type, version, data);
    }
}
