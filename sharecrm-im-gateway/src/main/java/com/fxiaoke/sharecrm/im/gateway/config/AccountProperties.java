package com.fxiaoke.sharecrm.im.gateway.config;

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
import java.util.concurrent.ConcurrentHashMap;

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

    /**
     * appId -> Account 索引（O(1) 查询）
     */
    private final Map<String, Account> appIdIndex = new ConcurrentHashMap<>();

    /**
     * (ea + botFullId) -> Account 索引（O(1) 查询）
     */
    private final Map<String, Account> botFullIdIndex = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        ConfigFactory.getInstance().getConfig("erpdss-openclaw-accounts", config -> {
            log.info("accounts reloaded begin, {}", accounts);
            String s = new String(config.getContent());
            List<Account> newAccounts = buildAccounts(s);
            rebuildIndexes(newAccounts);
            accounts = newAccounts;
            log.info("accounts reloaded, {}", accounts);
        });
    }

    /**
     * 重建索引
     */
    private void rebuildIndexes(List<Account> newAccounts) {
        appIdIndex.clear();
        botFullIdIndex.clear();
        for (Account account : newAccounts) {
            if (account.getAppId() != null) {
                appIdIndex.put(account.getAppId(), account);
            }
            if (account.getEa() != null && account.getBotFullId() != null) {
                botFullIdIndex.put(account.getEa() + "|" + account.getBotFullId(), account);
            }
        }
    }

    /**
     * 根据 appId 查询账号（O(1)）
     */
    public Account findByAppId(String appId) {
        return appIdIndex.get(appId);
    }

    /**
     * 根据 ea + botFullId 查询账号（O(1)）
     */
    public Account findByBotFullId(String ea, String botFullId) {
        return botFullIdIndex.get(ea + "|" + botFullId);
    }

    @NotNull
    public static List<Account> buildAccounts(String json) {
        List<Account> newAccounts = new ArrayList<>();
        if (json == null || json.trim().isEmpty()) {
            return newAccounts;
        }
        try {
            ObjectMapper mapper = new ObjectMapper();
            AccountsConfigPayload root = mapper.readValue(json, AccountsConfigPayload.class);
            Object accountsValue = root.getAccounts();
            if (accountsValue == null) {
                return newAccounts;
            }
            
            // 兼容两种格式：加密字符串 或 原始数组
            if (accountsValue instanceof String) {
                // 新格式：accounts 值是加密字符串
                String encryptedAccounts = (String) accountsValue;
                String decryptedAccounts = EncryptUtil.decrypt(encryptedAccounts);
                List<Account> accountList = mapper.readerForListOf(Account.class).readValue(decryptedAccounts);
                if (accountList != null) {
                    newAccounts.addAll(accountList);
                }
            } else if (accountsValue instanceof List) {
                // 旧格式：accounts 值是数组（兼容旧数据）
                List<Account> accountList = mapper.convertValue(accountsValue,
                        mapper.getTypeFactory().constructCollectionType(List.class, Account.class));
                if (accountList != null) {
                    newAccounts.addAll(accountList);
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse accounts config", e);
        }
        return newAccounts;
    }
}
