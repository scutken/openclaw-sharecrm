package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.facishare.qixin.api.model.open.arg.SendOpenAgentMessageArg;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fxiaoke.sharecrm.im.gateway.common.ErrorCode;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinClient;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinSessionId;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import javax.servlet.http.HttpServletRequest;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
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
    public Result<?> send(
            HttpServletRequest httpRequest,
            @RequestBody InboundRequest request) {

        // 从 Authorization 头部提取 Token
        String authHeader = httpRequest.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return Result.error(ErrorCode.AUTH_HEADER_MISSING);
        }

        String token = authHeader.substring(7); // 去掉 "Bearer " 前缀

        // 处理 chatId
        String chatId = resolveChatId(request);
        if (chatId == null || chatId.isEmpty()) {
            return Result.error(ErrorCode.PARAM_INVALID, "chat_id cannot be empty");
        }

        if (request.getText() == null || request.getText().isEmpty()) {
            return Result.error(ErrorCode.PARAM_INVALID, "text cannot be empty");
        }

        // 验证 Token 并发送消息
        Account account;
        try {
            account = authService.validateAccessToken(token);
        } catch (AuthException e) {
            log.warn("Token validation failed: {}", e.getMessage());
            ErrorCode errorCode = switch (e.getCode()) {
                case "TOKEN_EXPIRED" -> ErrorCode.TOKEN_EXPIRED;
                case "ACCOUNT_DISABLED" -> ErrorCode.ACCOUNT_DISABLED;
                default -> ErrorCode.TOKEN_INVALID;
            };
            return Result.error(errorCode, e.getMessage());
        }

        String appId = account.getAppId();
        String botFullId = account.getBotFullId();

        // 检查 Bot 是否在线
        var botSessionOpt = sessionManager.getBotSession(appId);
        if (botSessionOpt.isEmpty()) {
            log.warn("Bot offline: appId={}", appId);
            return Result.error(ErrorCode.BOT_NOT_CONNECTED);
        }

        // 构建企信发送参数
        QixinSessionId qixinSessionId;
        try {
            qixinSessionId = QixinSessionId.decode(chatId);
        } catch (IllegalArgumentException e) {
            return Result.error(ErrorCode.PARAM_INVALID, "Invalid chat_id format: " + e.getMessage());
        }

        SendOpenAgentMessageArg arg = new SendOpenAgentMessageArg();
        arg.setEnv(qixinSessionId.getEnv());
        arg.setEa(qixinSessionId.getEa());
        arg.setSessionId(qixinSessionId.getSessionId());
        arg.setParentSessionId(qixinSessionId.getParentSessionId());
        arg.setBotFullId(botFullId);
        arg.setAgentMessageInfo(request.getText());
        arg.setLocale(Locale.CHINA);
        if (request.getReplyMessageId() != null) {
            arg.setReplyMessageId(request.getReplyMessageId());
        }

        String messageId = "msg-" + System.currentTimeMillis();

        // 发送消息给企信
        try {
            qixinClient.sendMessage(arg);
        } catch (Exception e) {
            log.warn("[TO Qixin] Send failed: appId={}, sessionId={}, error={}",
                    appId, qixinSessionId.getSessionId(), e.getMessage(), e);
        }

        // 广播消息到模拟器（Bot 回复，无论企信发送成功与否）
        sessionManager.broadcastBotMessageToSimulators(appId, qixinSessionId.getSessionId(), messageId, request.getText());

        log.info("[TO Qixin] appId={}, env={}, ea={}, sessionId={}, text={}, messageId={}",
                appId, qixinSessionId.getEnv(), qixinSessionId.getEa(),
                qixinSessionId.getSessionId(), request.getText(), messageId);

        return Result.success(Map.of("message_id", messageId));
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
