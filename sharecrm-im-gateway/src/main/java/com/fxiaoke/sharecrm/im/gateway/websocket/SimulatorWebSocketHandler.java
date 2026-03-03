package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

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
 * 3. 支持多种消息类型（文本l1、图片、文件等）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SimulatorWebSocketHandler implements WebSocketHandler {

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
    public Mono<Void> handle(WebSocketSession session) {
        String sessionId = session.getId();
        log.info("模拟器 WebSocket 连接建立: {}", sessionId);

        // 创建消息发送器
        Sinks.Many<String> outbound = Sinks.many().unicast().onBackpressureBuffer();

        // 创建模拟器会话
        SimulatorSession simulatorSession = new SimulatorSession(sessionId, session, outbound);
        sessionManager.addSimulatorSession(simulatorSession);

        // 发送欢迎消息
        sendSystemInfo(simulatorSession, "已连接到消息模拟器");

        // 处理入站消息
        Mono<Void> input = session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .flatMap(message -> handleMessage(simulatorSession, message))
                .then();

        // 发送出站消息
        Mono<Void> output = session.send(
                outbound.asFlux().map(session::textMessage)
        );

        // 合并处理
        return Mono.zip(input, output)
                .doFinally(signal -> {
                    log.info("模拟器 WebSocket 连接关闭: {}, 原因: {}", sessionId, signal);
                    simulatorSession.setClosed(true);
                    sessionManager.removeSimulatorSession(sessionId);
                })
                .then();
    }

    /**
     * 处理模拟器消息
     */
    private Mono<Void> handleMessage(SimulatorSession session, String message) {
        return Mono.fromRunnable(() -> {
            try {
                JsonNode node = objectMapper.readTree(message);
                String type = node.has("type") ? node.get("type").asText() : "";

                log.debug("收到模拟器消息: type={}, sessionId={}", type, session.getSessionId());

                switch (type) {
                    case SimulatorMessageType.SUBSCRIBE -> handleSubscribe(session, node);
                    case SimulatorMessageType.UNSUBSCRIBE -> handleUnsubscribe(session);
                    default -> log.warn("未知模拟器消息类型: {}", type);
                }
            } catch (Exception e) {
                log.error("处理模拟器消息异常: {}", e.getMessage(), e);
                sendError(session, "消息处理失败: " + e.getMessage());
            }
        });
    }

    /**
     * 处理订阅请求
     */
    private void handleSubscribe(SimulatorSession session, JsonNode node) {
        String appId = node.has("appId") ? node.get("appId").asText() : null;
        String channelId = node.has("channelId") ? node.get("channelId").asText() : null;

        if (appId == null || appId.isEmpty()) {
            sendError(session, "appId 不能为空");
            return;
        }

        session.subscribe(appId, channelId);
        log.info("模拟器订阅: sessionId={}, appId={}, channelId={}", 
                session.getSessionId(), appId, channelId);
        
        sendSystemInfo(session, String.format("已订阅 appId=%s, channelId=%s", appId, channelId));
    }

    /**
     * 处理取消订阅
     */
    private void handleUnsubscribe(SimulatorSession session) {
        session.setSubscribedAppId(null);
        session.setSubscribedChannelId(null);
        log.info("模拟器取消订阅: sessionId={}", session.getSessionId());
        sendSystemInfo(session, "已取消订阅");
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
            session.getOutbound().tryEmitNext(json);
        } catch (Exception e) {
            log.error("发送系统信息失败", e);
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
            session.getOutbound().tryEmitNext(json);
        } catch (Exception e) {
            log.error("发送错误信息失败", e);
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
