package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

import java.util.Map;

/**
 * Bot WebSocket 处理器
 * 
 * 新协议：/bot{token}
 * - Token 放 URL，连接即鉴权（无需握手后发 AUTH）
 * - 心跳使用 WebSocket 原生 ping/pong
 * - 协议消息类型：connected, message, send, send_result, error
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BotWebSocketHandler implements WebSocketHandler {

    private final ObjectMapper objectMapper;
    private final AuthService authService;
    private final SessionManager sessionManager;

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        // 从 URL 提取 token: /bot{token}
        String path = session.getHandshakeInfo().getUri().getPath();
        String token = path.replaceFirst("^/bot", "");

        if (token.isEmpty()) {
            log.warn("连接失败: token 为空");
            return session.close();
        }

        return authService.validateToken(token)
            .flatMap(account -> handleAuthenticatedSession(session, account))
            .onErrorResume(e -> {
                log.error("连接失败: {}", e.getMessage());
                return sendError(session, null, "AUTH_FAILED", e.getMessage())
                    .then(session.close());
            });
    }

    private Mono<Void> handleAuthenticatedSession(WebSocketSession session, Account account) {
        log.info("Bot 连接成功: appId={}, botName={}", account.getAppId(), account.getBotName());

        Sinks.Many<String> outbound = Sinks.many().unicast().onBackpressureBuffer();
        BotSession botSession = new BotSession(session.getId(), account.getAppId(), session, outbound);
        sessionManager.registerBot(account.getAppId(), botSession);

        // 发送连接成功消息
        sendConnectedMessage(botSession, account);

        // 处理入站消息
        Mono<Void> input = session.receive()
            .map(WebSocketMessage::getPayloadAsText)
            .flatMap(msg -> handleMessage(botSession, msg))
            .then();

        // 发送出站消息
        Mono<Void> output = session.send(outbound.asFlux().map(session::textMessage));

        return Mono.zip(input, output)
            .doFinally(signal -> {
                log.info("Bot 断开连接: appId={}, signal={}", account.getAppId(), signal);
                sessionManager.unregisterBot(account.getAppId());
            })
            .then();
    }

    private void sendConnectedMessage(BotSession session, Account account) {
        try {
            String json = objectMapper.writeValueAsString(Map.of(
                "type", "connected",
                "data", Map.of(
                    "bot_id", account.getAppId(),
                    "bot_name", account.getBotName() != null ? account.getBotName() : account.getAppId()
                )
            ));
            session.send(json);
            log.debug("发送 connected 消息: appId={}", account.getAppId());
        } catch (Exception e) {
            log.error("发送连接消息失败", e);
        }
    }

    private Mono<Void> handleMessage(BotSession session, String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            String type = node.path("type").asText();
            String id = node.path("id").asText(null);
            JsonNode data = node.get("data");

            log.debug("收到消息: type={}, id={}, appId={}", type, id, session.getAppId());

            switch (type) {
                case "send":
                    handleSendMessage(session, id, data);
                    break;
                default:
                    log.warn("未知消息类型: {}", type);
                    sendError(session, id, "UNKNOWN_TYPE", "未知消息类型: " + type);
            }
        } catch (Exception e) {
            log.error("处理消息异常: {}", e.getMessage(), e);
        }
        return Mono.empty();
    }

    private void handleSendMessage(BotSession session, String requestId, JsonNode data) {
        if (data == null) {
            sendError(session, requestId, "INVALID_DATA", "data 不能为空");
            return;
        }

        String chatId = data.path("chat_id").asText(null);
        String text = data.path("text").asText(null);

        if (chatId == null || chatId.isEmpty()) {
            sendError(session, requestId, "INVALID_CHAT_ID", "chat_id 不能为空");
            return;
        }

        if (text == null || text.isEmpty()) {
            sendError(session, requestId, "INVALID_TEXT", "text 不能为空");
            return;
        }

        String messageId = "msg-" + System.currentTimeMillis();

        // 广播到模拟器
        sessionManager.broadcastBotMessageToSimulators(session.getAppId(), chatId, messageId, text);

        // 返回发送结果
        sendSendResult(session, requestId, messageId);
        
        log.info("[Bot 发送] appId={}, chatId={}, messageId={}, text={}", 
                session.getAppId(), chatId, messageId, text);
    }

    private void sendSendResult(BotSession session, String requestId, String messageId) {
        try {
            String json = objectMapper.writeValueAsString(Map.of(
                "type", "send_result",
                "id", requestId != null ? requestId : "",
                "ok", true,
                "data", Map.of("message_id", messageId)
            ));
            session.send(json);
        } catch (Exception e) {
            log.error("发送响应失败", e);
        }
    }

    private Mono<Void> sendError(WebSocketSession session, String requestId, String code, String message) {
        try {
            Map<String, Object> errorMap = Map.of(
                "type", "error",
                "id", requestId != null ? requestId : "",
                "error", Map.of(
                    "code", code,
                    "message", message
                )
            );
            String json = objectMapper.writeValueAsString(errorMap);
            return session.send(Mono.just(session.textMessage(json)));
        } catch (Exception e) {
            log.error("发送错误消息失败", e);
            return Mono.empty();
        }
    }

    private void sendError(BotSession session, String requestId, String code, String message) {
        try {
            Map<String, Object> errorMap = Map.of(
                "type", "error",
                "id", requestId != null ? requestId : "",
                "error", Map.of(
                    "code", code,
                    "message", message
                )
            );
            String json = objectMapper.writeValueAsString(errorMap);
            session.send(json);
        } catch (Exception e) {
            log.error("发送错误消息失败", e);
        }
    }
}
