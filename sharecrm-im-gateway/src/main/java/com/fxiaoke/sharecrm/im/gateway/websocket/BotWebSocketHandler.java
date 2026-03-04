package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
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
 * 新协议：/im-gateway/bot?token={accessToken}
 * - Token 放 URL query param，连接即鉴权（无需握手后发 AUTH）
 * - 心跳使用 WebSocket 原生 ping/pong
 * - 协议消息类型：connected, message, error
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
        // 从 URL query param 提取 token: /im-gateway/bot?token={accessToken}
        String query = session.getHandshakeInfo().getUri().getQuery();
        String token = extractToken(query);

        if (token == null || token.isEmpty()) {
            log.warn("连接失败: token 为空");
            return sendError(session, null, "AUTH_FAILED", "缺少 token 参数")
                    .then(session.close());
        }

        return authService.validateAccessToken(token)
            .flatMap(account -> handleAuthenticatedSession(session, account))
            .onErrorResume(AuthException.class, e -> {
                log.error("连接失败: {} - {}", e.getCode(), e.getMessage());
                return sendError(session, null, e.getCode(), e.getMessage())
                    .then(session.close());
            })
            .onErrorResume(e -> {
                log.error("连接失败: {}", e.getMessage());
                return sendError(session, null, "AUTH_FAILED", e.getMessage())
                    .then(session.close());
            });
    }

    /**
     * 从 query string 提取 token 参数
     */
    private String extractToken(String query) {
        if (query == null || query.isEmpty()) {
            return null;
        }
        for (String param : query.split("&")) {
            String[] parts = param.split("=", 2);
            if (parts.length == 2 && "token".equals(parts[0])) {
                return parts[1];
            }
        }
        return null;
    }

    private Mono<Void> handleAuthenticatedSession(WebSocketSession session, Account account) {
        log.info("Bot 连接成功: appId={}", account.getAppId());

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
                    "bot_id", account.getAppId()
                )
            ));
            session.send(json);
            log.debug("发送 connected 消息: appId={}", account.getAppId());
        } catch (Exception e) {
            log.error("发送连接消息失败", e);
        }
    }

    private Mono<Void> handleMessage(BotSession session, String message) {
        // 新协议下 Bot 不向 Gateway 发送消息，改由 REST API 发送
        // 这里仅记录日志
        log.debug("收到 WebSocket 消息: appId={}, message={}", session.getAppId(), message);
        return Mono.empty();
    }

    private Mono<Void> sendError(WebSocketSession session, String requestId, String code, String message) {
        try {
            Map<String, Object> errorMap = Map.of(
                "type", "error",
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
