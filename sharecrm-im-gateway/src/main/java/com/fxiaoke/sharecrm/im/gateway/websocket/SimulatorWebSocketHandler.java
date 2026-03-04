package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * 模拟器 WebSocket 处理器
 * 
 * 用于处理 Web UI 模拟器的 WebSocket 连接，支持：
 * - 订阅指定 App/Channel 的消息
 * - 接收机器人回复消息推送
 * 
 * 【扩展点-纷享IM接入】
 * 当接入真实纷享IM时，此处理器可扩展为：
 * 1. 通过纷享IM SDK接收真实消息
 * 2. 将真实IM消息转换为统一格式推送给前端
 * 3. 支持多种消息类型（文本、图片、文件等）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SimulatorWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final SessionManager sessionManager;

    /**
     * 模拟器消息类型
     */
    public static final class SimulatorMessageType {
        public static final String SUBSCRIBE = "subscribe";           // 订阅消息
        public static final String UNSUBSCRIBE = "unsubscribe";       // 取消订阅
        public static final String BOT_MESSAGE = "bot.message";       // 机器人消息
        public static final String USER_MESSAGE = "user.message";     // 用户消息（回显）
        public static final String SYSTEM_INFO = "system.info";       // 系统信息
        public static final String ERROR = "error";                   // 错误信息
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String sessionId = session.getId();
        log.info("Simulator WebSocket connected: {}", sessionId);

        // 创建模拟器会话
        SimulatorSession simulatorSession = new SimulatorSession(sessionId, session);
        sessionManager.addSimulatorSession(simulatorSession);

        // 保存到 session attributes
        session.getAttributes().put("simulatorSession", simulatorSession);

        // 发送欢迎消息
        sendSystemInfo(simulatorSession, "Connected to message simulator");
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        SimulatorSession simulatorSession = (SimulatorSession) session.getAttributes().get("simulatorSession");
        if (simulatorSession == null) {
            return;
        }

        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            String type = node.has("type") ? node.get("type").asText() : "";

            log.debug("Received simulator message: type={}, sessionId={}", type, simulatorSession.getSessionId());

            switch (type) {
                case SimulatorMessageType.SUBSCRIBE -> handleSubscribe(simulatorSession, node);
                case SimulatorMessageType.UNSUBSCRIBE -> handleUnsubscribe(simulatorSession);
                default -> log.warn("Unknown simulator message type: {}", type);
            }
        } catch (Exception e) {
            log.error("Failed to process simulator message: {}", e.getMessage(), e);
            sendError(simulatorSession, "Message processing failed: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        log.info("Simulator WebSocket closed: {}, reason: {}", sessionId, status);

        SimulatorSession simulatorSession = (SimulatorSession) session.getAttributes().get("simulatorSession");
        if (simulatorSession != null) {
            simulatorSession.setClosed(true);
        }
        sessionManager.removeSimulatorSession(sessionId);
    }

    /**
     * 处理订阅请求
     */
    private void handleSubscribe(SimulatorSession session, JsonNode node) {
        String appId = node.has("appId") ? node.get("appId").asText() : null;
        String channelId = node.has("channelId") ? node.get("channelId").asText() : null;

        if (appId == null || appId.isEmpty()) {
            sendError(session, "appId cannot be empty");
            return;
        }

        session.subscribe(appId, channelId);
        log.info("Simulator subscribed: sessionId={}, appId={}, channelId={}",
                session.getSessionId(), appId, channelId);
        
        sendSystemInfo(session, String.format("Subscribed appId=%s, channelId=%s", appId, channelId));
    }

    /**
     * 处理取消订阅
     */
    private void handleUnsubscribe(SimulatorSession session) {
        session.setSubscribedAppId(null);
        session.setSubscribedChannelId(null);
        log.info("Simulator unsubscribed: sessionId={}", session.getSessionId());
        sendSystemInfo(session, "Unsubscribed");
    }

    /**
     * 发送系统信息
     */
    private void sendSystemInfo(SimulatorSession session, String info) {
        try {
            String json = objectMapper.writeValueAsString(new SimulatorMessage(
                    SimulatorMessageType.SYSTEM_INFO,
                    null,
                    info,
                    System.currentTimeMillis()
            ));
            session.send(json);
        } catch (Exception e) {
            log.error("Failed to send system info", e);
        }
    }

    /**
     * 发送错误信息
     */
    private void sendError(SimulatorSession session, String error) {
        try {
            String json = objectMapper.writeValueAsString(new SimulatorMessage(
                    SimulatorMessageType.ERROR,
                    null,
                    error,
                    System.currentTimeMillis()
            ));
            session.send(json);
        } catch (Exception e) {
            log.error("Failed to send error message", e);
        }
    }

    /**
     * 模拟器消息结构
     * 
     * 【扩展点-纷享IM接入】
     * 当接入真实纷享IM时，可扩展此结构：
     * 1. 添加更多消息类型（图片、文件、卡片等）
     * 2. 添加消息元数据（已读状态、@提醒等）
     * 3. 支持消息撤回、编辑等操作
     */
    public record SimulatorMessage(
            String type,
            MessageData data,
            String text,
            long timestamp
    ) {
        public SimulatorMessage(String type, MessageData data, long timestamp) {
            this(type, data, null, timestamp);
        }
    }

    /**
     * 消息数据
     */
    public record MessageData(
            String messageId,
            String channelId,
            String text,
            String senderId,
            String senderName,
            boolean isBot
    ) {}
}
