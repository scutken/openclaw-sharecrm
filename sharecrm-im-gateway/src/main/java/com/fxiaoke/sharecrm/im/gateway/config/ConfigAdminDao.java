package com.fxiaoke.sharecrm.im.gateway.config;

import cn.hutool.core.util.StrUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.github.autoconf.admin.ConfigAdminClient;
import com.github.autoconf.admin.api.IConfigAdmin;
import com.github.autoconf.base.ProcessInfo;
import com.github.autoconf.helper.ConfigHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 开发者服务实现类
 *
 * @author xiejiay (^_−)☆
 */
@Slf4j
@Service
public class ConfigAdminDao {
    private final IConfigAdmin iConfigAdmin = new ConfigAdminClient();
    // 审批 https://www.fxiaoke.com/XV/Home/Index#stream/showfeed2019/=/id-9409943
    private final String openclawAccountConfig = "erpdss-openclaw-accounts";
    private final String erpdssConfigToken = "B60C41865B61CBD899144BEE75DE1CCEDB19F52CAD29D4F3D1FCE9FB24A5B0D4";

    /**
     * fstest或者foneshare
     */
    private String globalProfile = "undefined";

    @PostConstruct
    public void init() {
        ProcessInfo process = ConfigHelper.getProcessInfo();
        if (StrUtil.contains(process.getProfile(), "fstest") || StrUtil.contains(process.getProfileCandidates(), "fstest")) {
            globalProfile = "fstest";
        } else if (StrUtil.contains(process.getProfile(), "foneshare") || StrUtil.contains(process.getProfileCandidates(), "foneshare")) {
            globalProfile = "foneshare";
        }
        log.info("ConfigAdminDao init for {} ", globalProfile);
    }

    public void upsertAccount(Account account) {
        String accountsConfigValue = getAccountsConfigValue();

        List<Account> accounts = AccountProperties.buildAccounts(accountsConfigValue);
        accounts.stream().filter(v -> account.getEa().equals(v.getEa()) && account.getBotFullId().equals(v.getBotFullId())).findFirst().ifPresentOrElse(v -> {
            v.setAppId(account.getAppId());
            v.setAppSecret(account.getAppSecret());
            v.setEnabled(account.getEnabled());
        }, () -> accounts.add(account));
        try {
            ObjectMapper mapper = new ObjectMapper();
            // 只加密 accounts 数组
            String accountsJson = mapper.writeValueAsString(accounts);
            String encryptedAccounts = EncryptUtil.encrypt(accountsJson);
            String jsonContent = mapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsString(AccountsConfigPayload.encrypted(encryptedAccounts));
            iConfigAdmin.save(erpdssConfigToken, globalProfile, openclawAccountConfig, jsonContent);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public boolean deleteAccount(String ea, String botFullId) {
        String accountsConfigValue = getAccountsConfigValue();

        List<Account> accounts = AccountProperties.buildAccounts(accountsConfigValue);
        boolean exist = accounts.removeIf(account -> account.getEa().equals(ea) && account.getBotFullId().equals(botFullId));
        if (!exist) {
            return false;
        }

        try {
            ObjectMapper mapper = new ObjectMapper();
            // 只加密 accounts 数组
            String accountsJson = mapper.writeValueAsString(accounts);
            String encryptedAccounts = EncryptUtil.encrypt(accountsJson);
            String jsonContent = mapper.writerWithDefaultPrettyPrinter()
                    .writeValueAsString(AccountsConfigPayload.encrypted(encryptedAccounts));
            iConfigAdmin.save(erpdssConfigToken, globalProfile, openclawAccountConfig, jsonContent);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return true;
    }

    private String getAccountsConfigValue() {
        String config = null;
        try {
            config = iConfigAdmin.get(erpdssConfigToken, globalProfile, openclawAccountConfig);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        if (config == null) {
            throw new RuntimeException("not found config");
        }
        return new String(config.getBytes(StandardCharsets.UTF_8));
    }
}
