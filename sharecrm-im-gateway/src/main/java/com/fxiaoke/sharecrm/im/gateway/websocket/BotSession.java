package com.fxiaoke.sharecrm.im.gateway.websocket;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;

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
    private volatile boolean closed = false;

    public BotSession(String sessionId, String appId, WebSocketSession webSocketSession) {
        this.sessionId = sessionId;
        this.appId = appId;
        this.webSocketSession = webSocketSession;
    }

    /**
     * 发送消息
     */
    public void send(String message) {
        if (!closed && webSocketSession.isOpen()) {
            try {
                webSocketSession.sendMessage(new TextMessage(message));
            } catch (IOException e) {
                log.warn("Failed to send message: sessionId={}, error={}", sessionId, e.getMessage());
            }
        }
    }

    /**
     * 关闭会话
     */
    public void close() {
        this.closed = true;
        try {
            if (webSocketSession.isOpen()) {
                webSocketSession.close();
            }
        } catch (IOException e) {
            log.warn("Failed to close session: sessionId={}, error={}", sessionId, e.getMessage());
        }
    }
}
