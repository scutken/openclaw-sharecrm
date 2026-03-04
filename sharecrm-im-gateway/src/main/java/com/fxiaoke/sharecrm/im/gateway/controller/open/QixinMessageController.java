package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.facishare.qixin.api.model.open.arg.SendOpenAgentMessageArg;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinClient;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinSessionId;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * 企信消息发送接口（外部接口）
 * <p>
 * 消息流向：Bot → 网关 → 企信
 */
@Slf4j
@RestController
@RequestMapping("/im-gateway/qixin/message")
@RequiredArgsConstructor
public class QixinMessageController {

    private final AuthService authService;
    private final SessionManager sessionManager;
    private final QixinClient qixinClient;

    /**
     * 发送消息给企信
     * <p>
     * POST /im-gateway/qixin/message/send
     * Authorization: Bearer {accessToken}
     * <p>
     * Bot 通过此接口发送消息给企信用户
     */
    @PostMapping("/send")
    public Mono<Map<String, Object>> send(
            ServerWebExchange exchange,
            @RequestBody InboundRequest request) {

        // 从 Authorization 头部提取 Token
        String authHeader = exchange.getRequest().getHeaders().getFirst("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return Mono.just(Map.of(
                    "code", 40003,
                    "message", "缺少 Authorization 头部或格式错误"
            ));
        }

        String token = authHeader.substring(7); // 去掉 "Bearer " 前缀

        // 处理 chatId
        String chatId = resolveChatId(request);
        if (chatId == null || chatId.isEmpty()) {
            return Mono.just(Map.of(
                    "code", 40002,
                    "message", "chat_id 不能为空"
            ));
        }

        if (request.getText() == null || request.getText().isEmpty()) {
            return Mono.just(Map.of(
                    "code", 40002,
                    "message", "text 不能为空"
            ));
        }

        // 验证 Token 并发送消息
        return authService.validateAccessToken(token)
                .flatMap(account -> {
                    String appId = account.getAppId();
                    String botFullId = account.getBotFullId();

                    // 检查 Bot 是否在线
                    var botSessionOpt = sessionManager.getBotSession(appId);
                    if (botSessionOpt.isEmpty()) {
                        log.warn("Bot 不在线: appId={}", appId);
                        return Mono.just(Map.<String, Object>of(
                                "code", 50001,
                                "message", "Bot 未连接"
                        ));
                    }

                    // 构建企信发送参数
                    QixinSessionId qixinSessionId;
                    try {
                        qixinSessionId = QixinSessionId.decode(chatId);
                    } catch (IllegalArgumentException e) {
                        return Mono.just(Map.<String, Object>of(
                                "code", 40002,
                                "message", "chat_id 格式错误: " + e.getMessage()
                        ));
                    }

                    SendOpenAgentMessageArg arg = new SendOpenAgentMessageArg();
                    arg.setEnv(qixinSessionId.getEnv());
                    arg.setEa(qixinSessionId.getEa());
                    arg.setSessionId(qixinSessionId.getSessionId());
                    arg.setParentSessionId(qixinSessionId.getParentSessionId());
                    arg.setBotFullId(botFullId);
                    arg.setAgentMessageInfo(request.getText());
                    if (request.getReplyMessageId() != null) {
                        arg.setReplyMessageId(request.getReplyMessageId());
                    }

                    String messageId = "msg-" + System.currentTimeMillis();

                    // 发送消息给企信
                    return qixinClient.sendMessage(arg)
                            .doOnError(e -> log.warn("[TO Qixin] 发送失败: appId={}, sessionId={}, error={}",
                                    appId, qixinSessionId.getSessionId(), e.getMessage(), e))
                            .onErrorResume(e -> Mono.empty())
                            .then(Mono.fromRunnable(() -> {
                                // 广播消息到模拟器（Bot 回复，无论企信发送成功与否）
                                sessionManager.broadcastBotMessageToSimulators(appId, qixinSessionId.getSessionId(), messageId, request.getText());

                                log.info("[TO Qixin] appId={}, env={}, ea={}, sessionId={}, text={}, messageId={}",
                                        appId, qixinSessionId.getEnv(), qixinSessionId.getEa(),
                                        qixinSessionId.getSessionId(), request.getText(), messageId);
                            }))
                            .thenReturn(Map.<String, Object>of(
                                    "code", 0,
                                    "data", Map.of("message_id", messageId)
                            ));
                })
                .onErrorResume(AuthException.class, e -> {
                    log.warn("Token 验证失败: {}", e.getMessage());
                    int code = switch (e.getCode()) {
                        case "TOKEN_EXPIRED" -> 40003;
                        case "ACCOUNT_DISABLED" -> 40004;
                        default -> 40003;
                    };
                    return Mono.just(Map.of(
                            "code", code,
                            "message", e.getMessage()
                    ));
                })
                .onErrorResume(e -> {
                    log.warn("send qixin message error: {}", e.getMessage(), e);
                    return Mono.just(Map.of(
                            "code", 50001,
                            "message", "服务器内部错误"
                    ));
                });
    }

    private String resolveChatId(InboundRequest request) {
        // 优先使用直接传的 chatId
        if (request.getChatId() != null && !request.getChatId().isEmpty()) {
            return request.getChatId();
        }

        // 尝试从企信字段构建 chatId
        if (request.getSessionId() != null && !request.getSessionId().isEmpty()) {
            return QixinSessionId.of(
                    request.getEnv(),
                    request.getEa(),
                    request.getSessionId(),
                    request.getParentSessionId()
            ).encode();
        }

        return null;
    }

    /**
     * 下行消息请求
     */
    @Data
    public static class InboundRequest {
        @JsonProperty("chat_id")
        private String chatId;

        private String text;

        private int env;
        private String ea;

        @JsonProperty("session_id")
        private String sessionId;

        @JsonProperty("parent_session_id")
        private String parentSessionId;

        @JsonProperty("reply_message_id")
        private Long replyMessageId;
    }
}
