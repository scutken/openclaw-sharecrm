package com.fxiaoke.sharecrm.im.gateway.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

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
public class BotWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final AuthService authService;
    private final SessionManager sessionManager;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // 从 URL query param 提取 token: /im-gateway/bot?token={accessToken}
        String query = session.getUri() != null ? session.getUri().getQuery() : null;
        String token = extractToken(query);

        if (token == null || token.isEmpty()) {
            log.warn("Connection failed: empty token");
            sendError(session, "AUTH_FAILED", "Missing token parameter");
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        try {
            Account account = authService.validateAccessToken(token);
            handleAuthenticatedSession(session, account);
        } catch (AuthException e) {
            log.error("Connection failed: {} - {}", e.getCode(), e.getMessage());
            sendError(session, e.getCode(), e.getMessage());
            session.close(CloseStatus.NOT_ACCEPTABLE);
        } catch (Exception e) {
            log.error("Connection failed: {}", e.getMessage());
            sendError(session, "AUTH_FAILED", e.getMessage());
            session.close(CloseStatus.NOT_ACCEPTABLE);
        }
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

    private void handleAuthenticatedSession(WebSocketSession session, Account account) {
        log.info("Bot connected: appId={}", account.getAppId());

        BotSession botSession = new BotSession(session.getId(), account.getAppId(), session);
        sessionManager.registerBot(account.getAppId(), botSession);

        // 保存 appId 到 session attributes 用于后续处理
        session.getAttributes().put("appId", account.getAppId());

        // 发送连接成功消息
        sendConnectedMessage(botSession, account);
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
            log.debug("Sent connected message: appId={}", account.getAppId());
        } catch (Exception e) {
            log.error("Failed to send connected message", e);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // 新协议下 Bot 不向 Gateway 发送消息，改由 REST API 发送
        // 这里仅记录日志
        String appId = (String) session.getAttributes().get("appId");
        log.debug("Received WebSocket message: appId={}, message={}", appId, message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String appId = (String) session.getAttributes().get("appId");
        if (appId != null) {
            log.info("Bot disconnected: appId={}, status={}", appId, status);
            sessionManager.unregisterBot(appId);
        }
    }

    private void sendError(WebSocketSession session, String code, String message) {
        try {
            Map<String, Object> errorMap = Map.of(
                "type", "error",
                "error", Map.of(
                    "code", code,
                    "message", message
                )
            );
            String json = objectMapper.writeValueAsString(errorMap);
            session.sendMessage(new TextMessage(json));
        } catch (Exception e) {
            log.error("Failed to send error message", e);
        }
    }
}
