package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
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
            log.warn("Replacing existing Bot session: appId={}", appId);
            existing.close();
        }
        log.info("Bot session registered: appId={}, sessionId={}", appId, session.getSessionId());
    }

    /**
     * 注销 Bot 会话
     */
    public void unregisterBot(String appId) {
        BotSession removed = botSessions.remove(appId);
        if (removed != null) {
            log.info("Bot session unregistered: appId={}", appId);
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
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("message_id", messageId);
                data.put("chat_id", chatId);
                data.put("chat_type", "direct");
                data.put("from", Map.of(
                    "id", userId,
                    "name", userName
                ));
                data.put("text", text);
                data.put("date", System.currentTimeMillis() / 1000);

                String json = objectMapper.writeValueAsString(Map.of(
                    "type", "message",
                    "data", data
                ));
                session.send(json);
                log.debug("Message sent to Bot: appId={}, chatId={}", appId, chatId);
            } catch (Exception e) {
                log.error("Failed to send message to Bot: {}", e.getMessage());
            }
        });
    }

    /**
     * 向 Bot 发送企信格式消息
     * 
     * 包含完整的企信上下文信息
     */
    public void sendQixinMessageToBot(String appId, String chatId, String messageId, String text,
                                       String userId, String userName, String chatType, QixinMessage.InboundMessage qixinMessage) {
        getBotSession(appId).ifPresent(session -> {
            try {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("message_id", messageId);
                data.put("chat_id", chatId);
                data.put("chat_type", normalizeChatType(chatType));
                data.put("from", Map.of(
                    "id", userId,
                    "name", userName
                ));
                data.put("text", text);
                data.put("date", qixinMessage.getMessageTimestamp() != null 
                        ? qixinMessage.getMessageTimestamp() / 1000 
                        : System.currentTimeMillis() / 1000);
                
                // 添加企信特有字段
                Map<String, Object> qixinContext = new LinkedHashMap<>();
                qixinContext.put("env", qixinMessage.getEnv());
                qixinContext.put("ea", qixinMessage.getEa());
                qixinContext.put("session_id", qixinMessage.getSessionId());
                qixinContext.put("parent_session_id", qixinMessage.getParentSessionId());
                qixinContext.put("bot_full_id", qixinMessage.getBotFullId());
                qixinContext.put("message_type", qixinMessage.getMessageType());
                qixinContext.put("qixin_message_id", qixinMessage.getMessageId());
                qixinContext.put("reply_message_id", qixinMessage.getReplyMessageId());
                data.put("qixin", qixinContext);

                String json = objectMapper.writeValueAsString(Map.of(
                    "type", "message",
                    "data", data
                ));
                session.send(json);
                log.debug("Qixin message sent to Bot: appId={}, chatId={}", appId, chatId);
            } catch (Exception e) {
                log.error("Failed to send Qixin message to Bot: {}", e.getMessage());
            }
        });
    }

    private String normalizeChatType(String chatType) {
        if (chatType == null) {
            return "direct";
        }
        String normalized = chatType.trim().toLowerCase();
        if (normalized.isEmpty()) {
            return "direct";
        }
        return ("group".equals(normalized) || "channel".equals(normalized)) ? "group" : "direct";
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
