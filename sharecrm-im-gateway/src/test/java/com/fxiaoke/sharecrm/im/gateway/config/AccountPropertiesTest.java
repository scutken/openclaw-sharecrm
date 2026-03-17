package com.fxiaoke.sharecrm.im.gateway.config;

import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountPropertiesTest {

    @Test
    void buildAccounts_shouldParseEncryptedAccountsPayload() {
        String accountsJson = """
                [{"ea":"fs","appId":"app-1","appSecret":"secret-1","botFullId":"B.fs.bot1","enabled":true}]
                """;
        String configJson = """
                {
                  "accounts": "%s"
                }
                """.formatted(EncryptUtil.encrypt(accountsJson));

        List<Account> accounts = AccountProperties.buildAccounts(configJson);

        assertEquals(1, accounts.size());
        Account account = accounts.getFirst();
        assertEquals("fs", readField(account, "ea"));
        assertEquals("app-1", readField(account, "appId"));
        assertEquals("secret-1", readField(account, "appSecret"));
        assertEquals("B.fs.bot1", readField(account, "botFullId"));
        assertEquals(Boolean.TRUE, readField(account, "enabled"));
    }

    @Test
    void buildAccounts_shouldParseLegacyAccountsArrayPayload() {
        String configJson = """
                {
                  "accounts": [
                    {"ea":"fs","appId":"app-legacy","appSecret":"secret-legacy","botFullId":"B.fs.legacy","enabled":false}
                  ]
                }
                """;

        List<Account> accounts = AccountProperties.buildAccounts(configJson);

        assertEquals(1, accounts.size());
        Account account = accounts.getFirst();
        assertEquals("app-legacy", readField(account, "appId"));
        assertEquals("B.fs.legacy", readField(account, "botFullId"));
        assertNotNull(readField(account, "enabled"));
        assertEquals(Boolean.FALSE, readField(account, "enabled"));
    }

    @Test
    void buildAccounts_shouldReturnEmptyListWhenAccountsMissing() {
        List<Account> accounts = AccountProperties.buildAccounts("{}");

        assertNotNull(accounts);
        assertTrue(accounts.isEmpty());
    }

    @Test
    void buildAccounts_shouldSupportNullParentSessionCompatibility() {
        String configJson = """
                {
                  "accounts": [
                    {"ea":"fs","appId":"app-2","appSecret":"secret-2","botFullId":"B.fs.bot2"}
                  ]
                }
                """;

        List<Account> accounts = AccountProperties.buildAccounts(configJson);

        assertEquals(1, accounts.size());
        assertEquals(Boolean.TRUE, readField(accounts.getFirst(), "enabled"));
    }

    private static Object readField(Object target, String fieldName) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            return field.get(target);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("Failed to read field: " + fieldName, e);
        }
    }
}
