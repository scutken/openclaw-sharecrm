package com.fxiaoke.sharecrm.im.gateway.websocket;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;

/**
 * 模拟器会话
 * 用于管理 Web UI 模拟器的 WebSocket 连接
 */
@Slf4j
@Data
public class SimulatorSession {

    /**
     * WebSocket 会话ID
     */
    private final String sessionId;

    /**
     * 订阅的 App ID（模拟器选择监听哪个机器人）
     */
    private String subscribedAppId;

    /**
     * 订阅的会话 ID（模拟器选择监听哪个聊天会话）
     */
    private String subscribedChannelId;

    /**
     * WebSocket 会话
     */
    private final WebSocketSession webSocketSession;

    /**
     * 是否已关闭
     */
    private volatile boolean closed = false;

    public SimulatorSession(String sessionId, WebSocketSession webSocketSession) {
        this.sessionId = sessionId;
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
     * 订阅指定的 App 和 Channel
     */
    public void subscribe(String appId, String channelId) {
        this.subscribedAppId = appId;
        this.subscribedChannelId = channelId;
    }

    /**
     * 检查是否匹配订阅
     */
    public boolean matchesSubscription(String appId, String channelId) {
        if (subscribedAppId == null) {
            return false;
        }
        boolean appMatch = subscribedAppId.equals(appId);
        boolean channelMatch = subscribedChannelId == null || subscribedChannelId.equals(channelId);
        return appMatch && channelMatch;
    }
}
