package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.qixin.FromQixinMessage;
import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BotMessageControllerTest {

    @Mock
    private SseSessionManager sessionManager;

    @Mock
    private AccountService accountService;

    @InjectMocks
    private BotMessageController controller;

    private FromQixinMessage message;
    private Account account;

    @BeforeEach
    void setUp() {
        message = new FromQixinMessage();
        TestReflectionHelper.writeField(message, "ea", "fs");
        TestReflectionHelper.writeField(message, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(message, "sessionId", "session-1");
        TestReflectionHelper.writeField(message, "parentSessionId", "parent-1");
        TestReflectionHelper.writeField(message, "messageId", 100L);
        TestReflectionHelper.writeField(message, "messageContent", "hello");
        TestReflectionHelper.writeField(message, "senderFullId", "E.fs.7618");
        account = new Account();
        TestReflectionHelper.writeField(account, "ea", "fs");
        TestReflectionHelper.writeField(account, "appId", "app-1");
        TestReflectionHelper.writeField(account, "appSecret", "secret-1");
        TestReflectionHelper.writeField(account, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(account, "enabled", true);
    }

    @Test
    void send_shouldValidateRequiredFields() {
        FromQixinMessage invalid = new FromQixinMessage();

        Result<Void> result = controller.send(invalid);

        assertEquals(40001, TestReflectionHelper.readField(result, "code"));
        verify(accountService, never()).findByBotFullId(any(), any());
    }

    @Test
    void send_shouldReturnAccountNotFoundWhenNoMapping() {
        when(accountService.findByBotFullId("fs", "B.fs.bot1")).thenReturn(Optional.empty());

        Result<Void> result = controller.send(message);

        assertEquals(40005, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldReturnBotNotConnectedWhenOffline() {
        when(accountService.findByBotFullId("fs", "B.fs.bot1")).thenReturn(Optional.of(account));
        when(sessionManager.isOnline("app-1")).thenReturn(false);

        Result<Void> result = controller.send(message);

        assertEquals(50001, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldForwardMessageToSseSessionManager() {
        when(accountService.findByBotFullId("fs", "B.fs.bot1")).thenReturn(Optional.of(account));
        when(sessionManager.isOnline("app-1")).thenReturn(true);

        Result<Void> result = controller.send(message);

        assertEquals(0, TestReflectionHelper.readField(result, "code"));
        verify(sessionManager).sendQixinMessageToBot(
                eq("app-1"),
                eq("0:fs:session-1:parent-1"),
                eq("hello"),
                eq("E.fs.7618"),
                eq("7618"),
                eq("direct"),
                eq(message)
        );
    }
}
