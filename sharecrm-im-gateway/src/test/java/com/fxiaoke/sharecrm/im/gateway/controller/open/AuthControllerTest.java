package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private AuthService authService;

    @InjectMocks
    private AuthController controller;

    private AuthController.AuthTokenRequest request;
    private Account account;

    @BeforeEach
    void setUp() {
        request = new AuthController.AuthTokenRequest();
        TestReflectionHelper.writeField(request, "appId", "app-1");
        TestReflectionHelper.writeField(request, "appSecret", "secret-1");
        account = new Account();
        TestReflectionHelper.writeField(account, "ea", "fs");
        TestReflectionHelper.writeField(account, "appId", "app-1");
        TestReflectionHelper.writeField(account, "appSecret", "secret-1");
        TestReflectionHelper.writeField(account, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(account, "enabled", true);
    }

    @Test
    void getToken_shouldReturnTokenWhenAuthenticated() {
        AuthService.AuthResult authResult = AuthService.AuthResult.success(account);
        AuthService.TokenInfo tokenInfo = mock(AuthService.TokenInfo.class);
        when(tokenInfo.getAccessToken()).thenReturn("token-1");
        when(tokenInfo.getExpiresIn()).thenReturn(7200L);
        when(tokenInfo.getTokenType()).thenReturn("Bearer");
        when(authService.authenticate("app-1", "secret-1")).thenReturn(authResult);
        when(authService.generateAccessToken(account)).thenReturn(tokenInfo);

        Result<?> result = controller.getToken(request);

        assertEquals(0, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void getToken_shouldMapDisabledMessageToErrorCode() {
        when(authService.authenticate("app-1", "secret-1"))
                .thenReturn(AuthService.AuthResult.failure("Account disabled"));

        Result<?> result = controller.getToken(request);

        assertEquals(40004, TestReflectionHelper.readField(result, "code"));
    }

    @Test
    void getToken_shouldMapInvalidCredentialsToAccountNotFound() {
        when(authService.authenticate("app-1", "secret-1"))
                .thenReturn(AuthService.AuthResult.failure("Invalid appId or appSecret"));

        Result<?> result = controller.getToken(request);

        assertEquals(40001, TestReflectionHelper.readField(result, "code"));
    }
}
