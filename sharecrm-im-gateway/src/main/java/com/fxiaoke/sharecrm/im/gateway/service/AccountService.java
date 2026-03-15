package com.fxiaoke.sharecrm.im.gateway.service;

import com.fxiaoke.sharecrm.im.gateway.config.AccountProperties;
import com.fxiaoke.sharecrm.im.gateway.config.ConfigAdminDao;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * 账号服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountProperties accountProperties;
    private final ConfigAdminDao configAdminDao;

    /**
     * 获取所有账号
     */
    public List<Account> listAccounts() {
        return accountProperties.getAccounts();
    }

    /**
     * 根据 appId 查询账号（O(1)）
     */
    public Optional<Account> findByAppId(String appId) {
        Account account = accountProperties.findByAppId(appId);
        return Optional.ofNullable(account);
    }

    /**
     * 根据凭据查询账号（需要遍历，但可优化）
     */
    public Optional<Account> findByCredentials(String appId, String appSecret) {
        Account account = accountProperties.findByAppId(appId);
        if (account != null && appSecret != null && appSecret.equals(account.getAppSecret())) {
            return Optional.of(account);
        }
        return Optional.empty();
    }

    /**
     * 根据企信 botFullId 查询账号（O(1)）
     */
    public Optional<Account> findByBotFullId(String ea, String botFullId) {
        Account account = accountProperties.findByBotFullId(ea, botFullId);
        return Optional.ofNullable(account);
    }

    /**
     * 保存账号（新增或更新，以 ea + botFullId 为唯一键）
     */
    public void saveAccount(Account account) {
        configAdminDao.upsertAccount(account);
    }

    /**
     * 删除账号（以 ea + botFullId 为唯一键）
     */
    public boolean deleteAccount(String ea, String botFullId) {
        return configAdminDao.deleteAccount(ea, botFullId);
    }
}
