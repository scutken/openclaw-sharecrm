package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.qixin.QixinMessage;
import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * 发送消息到 Bot
 * 
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
     * 
     * 企信/模拟器发送的用户消息，转发给对应的 Bot
     */
    @PostMapping("/send")
    public Mono<QixinMessage.Response> send(@RequestBody QixinMessage.InboundMessage message) {
        log.info("[上行消息] botFullId={}, sessionId={}, sender={}, content={}", 
                message.getBotFullId(), message.getSessionId(), 
                message.getSenderFullId(), message.getMessageContent());

        // 验证必填参数
        if (message.getBotFullId() == null || message.getBotFullId().isEmpty()) {
            return Mono.just(QixinMessage.Response.error(40001, "botFullId 不能为空"));
        }
        if (message.getSessionId() == null || message.getSessionId().isEmpty()) {
            return Mono.just(QixinMessage.Response.error(40002, "sessionId 不能为空"));
        }
        if (message.getMessageContent() == null || message.getMessageContent().isEmpty()) {
            return Mono.just(QixinMessage.Response.error(40003, "messageContent 不能为空"));
        }

        // 根据 botFullId 查找对应的账号
        return accountService.findByBotFullId(message.getBotFullId())
                .switchIfEmpty(Mono.defer(() -> {
                    log.warn("未找到对应的账号: botFullId={}", message.getBotFullId());
                    return Mono.empty();
                }))
                .flatMap(account -> {
                    String appId = account.getAppId();

                    // 检查 Bot 是否在线
                    var botSessionOpt = sessionManager.getBotSession(appId);
                    if (botSessionOpt.isEmpty()) {
                        log.warn("Bot 不在线: appId={}, botFullId={}", appId, message.getBotFullId());
                        return Mono.just(QixinMessage.Response.error(50001, "Bot 未连接"));
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

                    log.info("[上行消息已转发] appId={}, chatId={}, messageId={}", 
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

                    return Mono.just(QixinMessage.Response.success());
                })
                .switchIfEmpty(Mono.just(QixinMessage.Response.error(40004, "未找到匹配的 Bot 账号")));
    }
}
