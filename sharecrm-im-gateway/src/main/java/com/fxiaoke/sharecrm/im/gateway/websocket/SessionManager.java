package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinMessage;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 会话管理器
 * 
 * 管理两类会话：
 * 1. Bot SSE 连接（通过 SseSessionManager）
 * 2. SimulatorSession - Web UI 模拟器的 WebSocket 连接
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionManager {

    private final ObjectMapper objectMapper;
    private final SseSessionManager sseSessionManager;

    /**
     * 模拟器会话 (sessionId -> session)
     */
    private final Map<String, SimulatorSession> simulatorSessions = new ConcurrentHashMap<>();

    // ==================== Bot 会话管理（委托给 SseSessionManager） ====================

    /**
     * 检查 Bot 是否在线
     */
    public boolean isBotOnline(String appId) {
        return sseSessionManager.isOnline(appId);
    }

    /**
     * 获取 Bot 在线数量
     */
    public int getBotOnlineCount() {
        return sseSessionManager.getBotOnlineCount();
    }

    /**
     * 获取所有在线 Bot 的 appId 列表
     */
    public List<String> getBotAppIds() {
        return sseSessionManager.getBotAppIds();
    }

    /**
     * 向 Bot 发送消息
     */
    public void sendMessageToBot(String appId, String chatId, String messageId, String text,
                                  String userId, String userName) {
        sseSessionManager.sendMessageToBot(appId, chatId, messageId, text, userId, userName);
    }

    /**
     * 向 Bot 发送企信格式消息
     */
    public void sendQixinMessageToBot(String appId, String chatId, String messageId, String text,
                                       String userId, String userName, String chatType, QixinMessage.InboundMessage qixinMessage) {
        sseSessionManager.sendQixinMessageToBot(appId, chatId, messageId, text, userId, userName, chatType, qixinMessage);
    }

    // ==================== 模拟器会话管理 ====================

    /**
     * 添加模拟器会话
     */
    public void addSimulatorSession(SimulatorSession session) {
        simulatorSessions.put(session.getSessionId(), session);
        log.info("Simulator session added: {}", session.getSessionId());
    }

    /**
     * 移除模拟器会话
     */
    public void removeSimulatorSession(String sessionId) {
        simulatorSessions.remove(sessionId);
        log.info("Simulator session removed: {}", sessionId);
    }

    /**
     * 获取模拟器会话数量
     */
    public int getSimulatorSessionCount() {
        return simulatorSessions.size();
    }

    // ==================== 消息广播 ====================

    /**
     * 广播 Bot 回复消息到模拟器
     */
    public void broadcastBotMessageToSimulators(String appId, String chatId, String messageId, String text) {
        log.info("[Bot reply] appId={}, chatId={}, text={}", appId, chatId, text);

        SimulatorWebSocketHandler.MessageData messageData = new SimulatorWebSocketHandler.MessageData(
                messageId,
                chatId,
                text,
                appId,
                "Bot",
                true
        );

        SimulatorWebSocketHandler.SimulatorMessage simMessage = new SimulatorWebSocketHandler.SimulatorMessage(
                SimulatorWebSocketHandler.SimulatorMessageType.BOT_MESSAGE,
                messageData,
                System.currentTimeMillis()
        );

        broadcastToMatchingSimulators(appId, chatId, simMessage);
    }

    /**
     * 广播用户消息到模拟器（消息回显）
     */
    public void broadcastUserMessageToSimulators(String appId, String channelId, String messageId,
                                                  String text, String userId, String userName) {
        log.debug("[User message] appId={}, channelId={}, text={}", appId, channelId, text);

        SimulatorWebSocketHandler.MessageData messageData = new SimulatorWebSocketHandler.MessageData(
                messageId,
                channelId,
                text,
                userId,
                userName,
                false
        );

        SimulatorWebSocketHandler.SimulatorMessage simMessage = new SimulatorWebSocketHandler.SimulatorMessage(
                SimulatorWebSocketHandler.SimulatorMessageType.USER_MESSAGE,
                messageData,
                System.currentTimeMillis()
        );

        broadcastToMatchingSimulators(appId, channelId, simMessage);
    }

    private void broadcastToMatchingSimulators(String appId, String channelId, 
                                                SimulatorWebSocketHandler.SimulatorMessage message) {
        simulatorSessions.values().forEach(session -> {
            if (!session.isClosed() && session.matchesSubscription(appId, channelId)) {
                try {
                    String json = objectMapper.writeValueAsString(message);
                    session.send(json);
                    log.debug("Message pushed to simulator: sessionId={}", session.getSessionId());
                } catch (Exception e) {
                    log.error("Failed to push message to simulator: {}", e.getMessage());
                }
            }
        });
    }
}
