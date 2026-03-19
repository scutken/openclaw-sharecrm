package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BotSseControllerTest {

    @Mock
    private AuthService authService;

    @Mock
    private SseSessionManager sseSessionManager;

    @InjectMocks
    private BotSseController controller;

    private Account account;

    @BeforeEach
    void setUp() {
        account = new Account();
        TestReflectionHelper.writeField(account, "ea", "fs");
        TestReflectionHelper.writeField(account, "appId", "app-1");
        TestReflectionHelper.writeField(account, "appSecret", "secret-1");
        TestReflectionHelper.writeField(account, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(account, "enabled", true);
        ReflectionTestUtils.setField(controller, "sseMaxLifetime", 1800000L);
        ReflectionTestUtils.setField(controller, "sseRetryDelay", 1000L);
    }

    @Test
    void connect_shouldRejectMissingToken() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.connect("", "1.2.0", null));
        assertEquals(401, ex.getStatus().value());
    }

    @Test
    void connect_shouldRejectInvalidToken() {
        when(authService.validateAccessToken("token")).thenThrow(new AuthException("TOKEN_INVALID", "Invalid token"));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.connect("token", "1.2.0", null));
        assertEquals(401, ex.getStatus().value());
    }

    @Test
    void connect_shouldRegisterEmitterWithProvidedVersion() {
        when(authService.validateAccessToken("token")).thenReturn(account);
        when(sseSessionManager.registerBot(eq("app-1"), any(SseEmitter.class), eq("1.2.0"))).thenReturn(true);

        SseEmitter emitter = controller.connect("token", "1.2.0", null);

        assertNotNull(emitter);
        verify(sseSessionManager, timeout(500)).registerBot(eq("app-1"), any(SseEmitter.class), eq("1.2.0"));
    }

    @Test
    void connect_shouldUseZeroTimeoutForLegacyVersion() {
        when(authService.validateAccessToken("token")).thenReturn(account);

        SseEmitter emitter = controller.connect("token", "v1.0.0", null);

        assertNotNull(emitter);
        assertEquals(0L, emitter.getTimeout());
    }
}
