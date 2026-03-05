package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.common.ErrorCode;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinMessage;
import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 发送消息到 Bot
 * <p>
 * 消息流向：企信/模拟器 → 网关 → Bot
 * 路径：/bot/message/send
 */
@Slf4j
@RestController
@RequestMapping("/bot/message")
@RequiredArgsConstructor
public class BotMessageController {

    private final SessionManager sessionManager;
    private final AccountService accountService;

    /**
     * 发送消息给 Bot
     * <p>
     * 企信/模拟器发送的用户消息，转发给对应的 Bot
     */
    @PostMapping("/send")
    public Result<Void> send(@RequestBody QixinMessage.InboundMessage message) {
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

        // 检查 Bot 是否在线（SSE 或 WebSocket）
        if (!sessionManager.isBotOnline(appId)) {
            log.warn("Bot offline: appId={}, botFullId={}", appId, message.getBotFullId());
            return Result.error(ErrorCode.BOT_NOT_CONNECTED);
        }

        String internalMessageId = "msg-" + UUID.randomUUID().toString().substring(0, 8);
        String encodedChatId = message.encodeChatId();

        if (message.getMessageType() == null) {
            message.setMessageType("T");
        }
        if (message.getChatType() == null || message.getChatType().isBlank()) {
            message.setChatType("direct");
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
                internalMessageId,
                text,
                message.getSenderFullId(),
                message.extractUserName(),
                message.getChatType(),
                message
        );

        log.info("[Message forwarded] appId={}, chatId={}, messageId={}",
                appId, encodedChatId, internalMessageId);

        // 广播到模拟器（使用原始 sessionId 以便模拟器匹配）
        sessionManager.broadcastUserMessageToSimulators(
                appId,
                message.getSessionId(),
                internalMessageId,
                text,
                message.getSenderFullId(),
                message.extractUserName()
        );

        return Result.success();
    }
}
