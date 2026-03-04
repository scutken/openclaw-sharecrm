package com.fxiaoke.sharecrm.im.gateway.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.github.autoconf.ConfigFactory;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.jetbrains.annotations.NotNull;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 账号配置属性
 */
@Slf4j
@Data
@Component
public class AccountProperties {

    /**
     * 账号列表
     */
    private List<Account> accounts = new ArrayList<>();

    @PostConstruct
    public void init() {
        ConfigFactory.getInstance().getConfig("erpdss-openclaw-accounts", config -> {
            log.info("accounts reloaded begin, {}", accounts);
            String s = new String(config.getContent());
            List<Account> newAccounts = buildAccounts(s);
            accounts = newAccounts;
            log.info("accounts reloaded, {}", accounts);
        });
    }

    @NotNull
    public static List<Account> buildAccounts(String json) {
        List<Account> newAccounts = new ArrayList<>();
        if (json == null || json.trim().isEmpty()) {
            return newAccounts;
        }
        try {
            ObjectMapper mapper = new ObjectMapper();
            Map<String, List<Account>> root = mapper.readValue(json, new TypeReference<Map<String, List<Account>>>() {});
            List<Account> accountList = root.get("accounts");
            if (accountList != null) {
                newAccounts.addAll(accountList);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse accounts config", e);
        }
        return newAccounts;
    }
}
