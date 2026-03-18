package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.common.ErrorCode;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.qixin.FromQixinMessage;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinClient;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinSessionId;
import com.fxiaoke.sharecrm.im.gateway.qixin.ToQixinMessage;
import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 发送消息到 Bot
 * <p>
 * 消息流向：企信 → 网关 → Bot
 * 路径：/bot/message/send
 */
@Slf4j
@RestController
@RequestMapping("/bot/message")
@RequiredArgsConstructor
public class BotMessageController {

    private static final String COMMAND_HELP = String.join("\n",
            "可用命令：",
            "!userId - 返回当前发送人的 userId",
            "!chatId - 返回当前会话的 chat_id"
    );

    private final SseSessionManager sessionManager;
    private final AccountService accountService;
    private final QixinClient qixinClient;

    /**
     * 发送消息给 Bot
     * <p>
     * 企信发送的用户消息，转发给对应的 Bot
     */
    @PostMapping("/send")
    public Result<Void> send(@RequestBody FromQixinMessage message) {
        log.info("[To Bot] botFullId={}, sessionId={}, sender={}, content={}",
                message.getBotFullId(), message.getSessionId(),
                message.getSenderFullId(), message.getMessageContent());
        // 验证必填参数
        if (message.getBotFullId() == null || message.getBotFullId().isEmpty()) {
            return Result.error(ErrorCode.PARAM_MISSING, "botFullId cannot be empty");
        }
        if (message.getSessionId() == null || message.getSessionId().isEmpty()) {
            return Result.error(ErrorCode.PARAM_INVALID, "sessionId cannot be empty");
        }
        if (message.getMessageContent() == null || message.getMessageContent().isEmpty()) {
            return Result.error(ErrorCode.PARAM_INVALID, "messageContent cannot be empty");
        }

        // 根据 botFullId 查找对应的账号
        var accountOpt = accountService.findByBotFullId(message.getEa(), message.getBotFullId());
        if (accountOpt.isEmpty()) {
            log.warn("Account not found: botFullId={}", message.getBotFullId());
            return Result.error(ErrorCode.ACCOUNT_NOT_FOUND, "No matching Bot account found");
        }

        var account = accountOpt.get();
        String appId = account.getAppId();
        String ea = account.getEa();
        String encodedChatId = message.encodeChatId();

        if (handleGatewayCommand(message, account.getBotFullId(), ea, encodedChatId)) {
            return Result.success();
        }

        // 检查 Bot 是否在线（SSE）
        if (!sessionManager.isOnline(appId)) {
            log.warn("Bot offline: appId={}, botFullId={}", appId, message.getBotFullId());
            return Result.error(ErrorCode.BOT_NOT_CONNECTED);
        }

        if (message.getMessageType() == null) {
            message.setMessageType("T");
        }
        if (message.getMessageTimestamp() == null) {
            message.setMessageTimestamp(System.currentTimeMillis());
        }
        if (message.getSenderFullId() == null) {
            message.setSenderFullId("E." + message.getEa() + ".unknown");
        }
        String text = message.getMessageContent();

        sessionManager.sendQixinMessageToBot(
                appId,
                encodedChatId,
                text,
                message.getSenderFullId(),
                message.extractUserName(),
                "direct", //目前固定是私聊
                message
        );

        log.info("[Message forwarded] appId={}, chatId={}, messageId={}",
                appId, encodedChatId, message.getMessageId());

        return Result.success();
    }

    private boolean handleGatewayCommand(FromQixinMessage message, String botFullId, String ea, String encodedChatId) {
        String content = message.getMessageContent();
        if (content == null) {
            return false;
        }

        String normalized = content.trim();
        if (normalized.isEmpty()) {
            return false;
        }

        String replyText;
        switch (normalized) {
            case "!!":
                replyText = COMMAND_HELP;
                break;
            case "!userId":
                replyText = String.valueOf(message.extractUserId());
                break;
            case "!chatId":
                replyText = encodedChatId;
                break;
            default:
                return false;
        }

        QixinSessionId sessionId = QixinSessionId.of(message.getEnv(), ea, message.getSessionId(), message.getParentSessionId());
        qixinClient.sendMessage(ToQixinMessage.from(botFullId, ea, sessionId, replyText, null));
        log.info("[Gateway command handled] command={}, sessionId={}, sender={}", normalized, message.getSessionId(), message.getSenderFullId());
        return true;
    }
}
