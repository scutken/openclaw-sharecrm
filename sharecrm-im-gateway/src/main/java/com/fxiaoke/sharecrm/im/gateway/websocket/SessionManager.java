package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 会话管理器
 * 
 * 管理两类会话：
 * 1. BotSession - Bot WebSocket 连接 (/bot{token})
 * 2. SimulatorSession - Web UI 模拟器的 WebSocket 连接
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionManager {

    private final ObjectMapper objectMapper;

    /**
     * Bot 会话 (appId -> session)
     */
    private final Map<String, BotSession> botSessions = new ConcurrentHashMap<>();

    /**
     * 模拟器会话 (sessionId -> session)
     */
    private final Map<String, SimulatorSession> simulatorSessions = new ConcurrentHashMap<>();

    // ==================== Bot 会话管理 ====================

    /**
     * 注册 Bot 会话
     */
    public void registerBot(String appId, BotSession session) {
        BotSession existing = botSessions.put(appId, session);
        if (existing != null) {
            log.warn("替换已存在的 Bot 会话: appId={}", appId);
            existing.close();
        }
        log.info("注册 Bot 会话: appId={}, sessionId={}", appId, session.getSessionId());
    }

    /**
     * 注销 Bot 会话
     */
    public void unregisterBot(String appId) {
        BotSession removed = botSessions.remove(appId);
        if (removed != null) {
            log.info("注销 Bot 会话: appId={}", appId);
        }
    }

    /**
     * 获取 Bot 会话
     */
    public Optional<BotSession> getBotSession(String appId) {
        return Optional.ofNullable(botSessions.get(appId));
    }

    /**
     * 获取 Bot 在线数量
     */
    public int getBotOnlineCount() {
        return botSessions.size();
    }

    /**
     * 获取所有在线 Bot 的 appId 列表
     */
    public List<String> getBotAppIds() {
        return new ArrayList<>(botSessions.keySet());
    }

    /**
     * 向 Bot 发送消息
     */
    public void sendMessageToBot(String appId, String chatId, String messageId, String text, 
                                  String userId, String userName) {
        getBotSession(appId).ifPresent(session -> {
            try {
                String json = objectMapper.writeValueAsString(Map.of(
                    "type", "message",
                    "data", Map.of(
                        "message_id", messageId,
                        "chat_id", chatId,
                        "chat_type", "direct",
                        "from", Map.of(
                            "id", userId,
                            "name", userName
                        ),
                        "text", text,
                        "date", System.currentTimeMillis() / 1000
                    )
                ));
                session.send(json);
                log.debug("发送消息到 Bot: appId={}, chatId={}", appId, chatId);
            } catch (Exception e) {
                log.error("发送消息到 Bot 失败: {}", e.getMessage());
            }
        });
    }

    // ==================== 模拟器会话管理 ====================

    /**
     * 添加模拟器会话
     */
    public void addSimulatorSession(SimulatorSession session) {
        simulatorSessions.put(session.getSessionId(), session);
        log.info("添加模拟器会话: {}", session.getSessionId());
    }

    /**
     * 移除模拟器会话
     */
    public void removeSimulatorSession(String sessionId) {
        simulatorSessions.remove(sessionId);
        log.info("移除模拟器会话: {}", sessionId);
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
        log.info("[Bot 回复] appId={}, chatId={}, text={}", appId, chatId, text);

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
        log.debug("[User 消息] appId={}, channelId={}, text={}", appId, channelId, text);

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
                    session.getOutbound().tryEmitNext(json);
                    log.debug("推送消息到模拟器: sessionId={}", session.getSessionId());
                } catch (Exception e) {
                    log.error("推送消息到模拟器失败: {}", e.getMessage());
                }
            }
        });
    }
}
