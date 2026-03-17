package com.fxiaoke.sharecrm.im.gateway.service;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private AccountService accountService;

    @InjectMocks
    private AuthService authService;

    private Account enabledAccount;
    private Account disabledAccount;

    @BeforeEach
    void setUp() {
        enabledAccount = new Account();
        TestReflectionHelper.writeField(enabledAccount, "ea", "fs");
        TestReflectionHelper.writeField(enabledAccount, "appId", "app-1");
        TestReflectionHelper.writeField(enabledAccount, "appSecret", "secret-1");
        TestReflectionHelper.writeField(enabledAccount, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(enabledAccount, "enabled", true);

        disabledAccount = new Account();
        TestReflectionHelper.writeField(disabledAccount, "ea", "fs");
        TestReflectionHelper.writeField(disabledAccount, "appId", "app-2");
        TestReflectionHelper.writeField(disabledAccount, "appSecret", "secret-2");
        TestReflectionHelper.writeField(disabledAccount, "botFullId", "B.fs.bot2");
        TestReflectionHelper.writeField(disabledAccount, "enabled", false);
    }

    @Test
    void generateAccessToken_shouldReturnBearerToken() {
        AuthService.TokenInfo tokenInfo = authService.generateAccessToken(enabledAccount);

        assertNotNull(TestReflectionHelper.readField(tokenInfo, "accessToken"));
        assertEquals(7200L, TestReflectionHelper.readField(tokenInfo, "expiresIn"));
        assertEquals("Bearer", TestReflectionHelper.readField(tokenInfo, "tokenType"));
    }

    @Test
    void validateAccessToken_shouldReturnAccountForValidToken() {
        String token = (String) TestReflectionHelper.readField(authService.generateAccessToken(enabledAccount), "accessToken");
        when(accountService.findByAppId("app-1")).thenReturn(java.util.Optional.of(enabledAccount));

        Account result = authService.validateAccessToken(token);

        assertSame(enabledAccount, result);
    }

    @Test
    void validateAccessToken_shouldRejectEmptyToken() {
        AuthException ex = assertThrows(AuthException.class, () -> authService.validateAccessToken(""));
        assertEquals("TOKEN_INVALID", TestReflectionHelper.readField(ex, "code"));
    }

    @Test
    void validateAccessToken_shouldRejectUnknownAccount() {
        String token = (String) TestReflectionHelper.readField(authService.generateAccessToken(enabledAccount), "accessToken");
        when(accountService.findByAppId("app-1")).thenReturn(java.util.Optional.empty());

        AuthException ex = assertThrows(AuthException.class, () -> authService.validateAccessToken(token));
        assertEquals("AUTH_FAILED", TestReflectionHelper.readField(ex, "code"));
    }

    @Test
    void validateAccessToken_shouldRejectDisabledAccount() {
        String token = (String) TestReflectionHelper.readField(authService.generateAccessToken(disabledAccount), "accessToken");
        when(accountService.findByAppId("app-2")).thenReturn(java.util.Optional.of(disabledAccount));

        AuthException ex = assertThrows(AuthException.class, () -> authService.validateAccessToken(token));
        assertEquals("ACCOUNT_DISABLED", TestReflectionHelper.readField(ex, "code"));
    }

    @Test
    void authenticate_shouldHandleSuccessDisabledAndInvalidCases() {
        when(accountService.findByCredentials("app-1", "secret-1")).thenReturn(java.util.Optional.of(enabledAccount));
        when(accountService.findByCredentials("app-2", "secret-2")).thenReturn(java.util.Optional.of(disabledAccount));
        when(accountService.findByCredentials("app-3", "wrong")).thenReturn(java.util.Optional.empty());

        AuthService.AuthResult success = authService.authenticate("app-1", "secret-1");
        AuthService.AuthResult disabled = authService.authenticate("app-2", "secret-2");
        AuthService.AuthResult invalid = authService.authenticate("app-3", "wrong");
        AuthService.AuthResult missing = authService.authenticate(null, null);

        assertTrue((Boolean) TestReflectionHelper.readField(success, "success"));
        assertSame(enabledAccount, TestReflectionHelper.readField(success, "account"));
        assertEquals("Account disabled", TestReflectionHelper.readField(disabled, "message"));
        assertEquals("Invalid appId or appSecret", TestReflectionHelper.readField(invalid, "message"));
        assertEquals("appId and appSecret cannot be empty", TestReflectionHelper.readField(missing, "message"));
    }
}
