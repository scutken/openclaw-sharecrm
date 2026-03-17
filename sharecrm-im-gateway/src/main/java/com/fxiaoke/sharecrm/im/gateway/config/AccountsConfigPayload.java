package com.fxiaoke.sharecrm.im.gateway.config;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 账号配置载荷
 */
public class AccountsConfigPayload {

    @JsonProperty("accounts")
    private Object accounts;

    public AccountsConfigPayload() {
    }

    public AccountsConfigPayload(Object accounts) {
        this.accounts = accounts;
    }

    public static AccountsConfigPayload encrypted(String encryptedAccounts) {
        return new AccountsConfigPayload(encryptedAccounts);
    }

    public Object getAccounts() {
        return accounts;
    }

    public void setAccounts(Object accounts) {
        this.accounts = accounts;
    }
}
