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
     * 根据 appId 查询账号
     */
    public Optional<Account> findByAppId(String appId) {
        return accountProperties.getAccounts().stream()
                .filter(account -> account.getAppId().equals(appId))
                .findFirst();
    }

    /**
     * 根据凭据查询账号
     */
    public Optional<Account> findByCredentials(String appId, String appSecret) {
        return accountProperties.getAccounts().stream()
                .filter(account -> account.getAppId().equals(appId)
                        && account.getAppSecret().equals(appSecret))
                .findFirst();
    }

    /**
     * 根据企信 botFullId 查询账号
     */
    public Optional<Account> findByBotFullId(String ea,String botFullId) {
        return accountProperties.getAccounts().stream()
                .filter(account -> ea.equals(account.getEa()) && botFullId.equals(account.getBotFullId()))
                .findFirst();
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
