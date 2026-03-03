package com.fxiaoke.sharecrm.im.gateway.websocket;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Sinks;

/**
 * Bot WebSocket 会话
 * 
 * 用于管理 OpenClaw 插件通过新协议（/bot{token}）连接的会话
 */
@Slf4j
@Getter
public class BotSession {

    private final String sessionId;
    private final String appId;
    private final WebSocketSession webSocketSession;
    private final Sinks.Many<String> outbound;
    private volatile boolean closed = false;

    public BotSession(String sessionId, String appId, WebSocketSession webSocketSession, Sinks.Many<String> outbound) {
        this.sessionId = sessionId;
        this.appId = appId;
        this.webSocketSession = webSocketSession;
        this.outbound = outbound;
    }

    /**
     * 发送消息
     */
    public void send(String message) {
        if (!closed) {
            Sinks.EmitResult result = outbound.tryEmitNext(message);
            if (result.isFailure()) {
                log.warn("发送消息失败: sessionId={}, result={}", sessionId, result);
            }
        }
    }

    /**
     * 关闭会话
     */
    public void close() {
        this.closed = true;
        outbound.tryEmitComplete();
    }
}
