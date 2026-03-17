package com.fxiaoke.sharecrm.im.gateway.service;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.fxiaoke.sharecrm.im.gateway.config.AccountProperties;
import com.fxiaoke.sharecrm.im.gateway.config.ConfigAdminDao;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountProperties accountProperties;

    @Mock
    private ConfigAdminDao configAdminDao;

    @InjectMocks
    private AccountService accountService;

    private Account account;

    @BeforeEach
    void setUp() {
        account = new Account();
        TestReflectionHelper.writeField(account, "ea", "fs");
        TestReflectionHelper.writeField(account, "appId", "app-1");
        TestReflectionHelper.writeField(account, "appSecret", "secret-1");
        TestReflectionHelper.writeField(account, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(account, "enabled", true);
    }

    @Test
    void listAccounts_shouldDelegateToProperties() {
        when(accountProperties.getAccounts()).thenReturn(List.of(account));

        List<Account> result = accountService.listAccounts();

        assertEquals(1, result.size());
        assertSame(account, result.getFirst());
    }

    @Test
    void findByAppId_shouldReturnOptionalWhenFound() {
        when(accountProperties.findByAppId("app-1")).thenReturn(account);

        assertTrue(accountService.findByAppId("app-1").isPresent());
    }

    @Test
    void findByAppId_shouldReturnEmptyWhenMissing() {
        when(accountProperties.findByAppId("missing")).thenReturn(null);

        assertTrue(accountService.findByAppId("missing").isEmpty());
    }

    @Test
    void findByCredentials_shouldMatchSecret() {
        when(accountProperties.findByAppId("app-1")).thenReturn(account);

        assertTrue(accountService.findByCredentials("app-1", "secret-1").isPresent());
        assertFalse(accountService.findByCredentials("app-1", "wrong").isPresent());
        assertFalse(accountService.findByCredentials("app-1", null).isPresent());
    }

    @Test
    void findByBotFullId_shouldDelegateToProperties() {
        when(accountProperties.findByBotFullId("fs", "B.fs.bot1")).thenReturn(account);

        assertTrue(accountService.findByBotFullId("fs", "B.fs.bot1").isPresent());
    }

    @Test
    void saveAndDelete_shouldDelegateToConfigAdminDao() {
        when(configAdminDao.deleteAccount("fs", "B.fs.bot1")).thenReturn(true);

        accountService.saveAccount(account);
        boolean deleted = accountService.deleteAccount("fs", "B.fs.bot1");

        verify(configAdminDao).upsertAccount(account);
        verify(configAdminDao).deleteAccount("fs", "B.fs.bot1");
        assertTrue(deleted);
    }
}
