package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.facishare.qixin.api.model.message.result.SendMessageResult;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinClient;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class QixinMessageControllerTest {

    @Mock
    private AuthService authService;

    @Mock
    private SseSessionManager sessionManager;

    @Mock
    private QixinClient qixinClient;

    @InjectMocks
    private QixinMessageController controller;

    private MockHttpServletRequest request;
    private QixinMessageController.FromBotRequest body;
    private Account account;

    @BeforeEach
    void setUp() {
        request = new MockHttpServletRequest();
        body = new QixinMessageController.FromBotRequest();
        TestReflectionHelper.writeField(body, "chatId", "0:fs:session-1:parent-1");
        TestReflectionHelper.writeField(body, "text", "hello");
        TestReflectionHelper.writeField(body, "replyMessageId", 123L);
        account = new Account();
        TestReflectionHelper.writeField(account, "ea", "fs");
        TestReflectionHelper.writeField(account, "appId", "app-1");
        TestReflectionHelper.writeField(account, "appSecret", "secret-1");
        TestReflectionHelper.writeField(account, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(account, "enabled", true);
    }

    @Test
    void send_shouldRequireAuthorizationHeader() {
        Result<?> result = controller.send(request, body);
        assertEquals(40003, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldValidateBodyFields() {
        request.addHeader("Authorization", "Bearer token");
        TestReflectionHelper.writeField(body, "chatId", "");

        Result<?> result = controller.send(request, body);
        assertEquals(40002, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldMapAuthExceptionToTokenExpired() {
        request.addHeader("Authorization", "Bearer token");
        when(authService.validateAccessToken("token")).thenThrow(new AuthException("TOKEN_EXPIRED", "Token expired"));

        Result<?> result = controller.send(request, body);
        assertEquals(40101, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldReturnBotNotConnectedWhenOffline() {
        request.addHeader("Authorization", "Bearer token");
        when(authService.validateAccessToken("token")).thenReturn(account);
        when(sessionManager.isOnline("app-1")).thenReturn(false);

        Result<?> result = controller.send(request, body);
        assertEquals(50001, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldRejectInvalidChatIdAndEaMismatch() {
        request.addHeader("Authorization", "Bearer token");
        when(authService.validateAccessToken("token")).thenReturn(account);
        when(sessionManager.isOnline("app-1")).thenReturn(true);

        TestReflectionHelper.writeField(body, "chatId", "invalid");
        Result<?> invalid = controller.send(request, body);
        assertEquals(40002, TestReflectionHelper.readField(invalid, "code"));

        TestReflectionHelper.writeField(body, "chatId", "0:other:session-1:");
        Result<?> mismatch = controller.send(request, body);
        assertEquals(40002, TestReflectionHelper.readField(mismatch, "code"));
    }

    @Test
    void send_shouldReturnSuccessWhenQixinSendSucceeds() {
        request.addHeader("Authorization", "Bearer token");
        when(authService.validateAccessToken("token")).thenReturn(account);
        when(sessionManager.isOnline("app-1")).thenReturn(true);

        SendMessageResult sendMessageResult = mock(SendMessageResult.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
        when(sendMessageResult.getMessageItem().getMessageId()).thenReturn(999L);
        when(qixinClient.sendMessage(any())).thenReturn(sendMessageResult);

        Result<?> result = controller.send(request, body);
        assertEquals(0, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void send_shouldReturnInternalErrorWhenQixinSendFails() {
        request.addHeader("Authorization", "Bearer token");
        when(authService.validateAccessToken("token")).thenReturn(account);
        when(sessionManager.isOnline("app-1")).thenReturn(true);
        when(qixinClient.sendMessage(any())).thenThrow(new RuntimeException("boom"));

        Result<?> result = controller.send(request, body);
        assertEquals(50000, TestReflectionHelper.readField(result, "code"));
    }
}
