package com.fxiaoke.sharecrm.im.gateway.service;

import com.fxiaoke.sharecrm.im.gateway.config.AccountProperties;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * 账号服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountProperties accountProperties;

    /**
     * 获取所有账号
     */
    public Flux<Account> listAccounts() {
        return Flux.fromIterable(accountProperties.getAccounts());
    }

    /**
     * 根据 appId 查询账号
     */
    public Mono<Account> findByAppId(String appId) {
        return Flux.fromIterable(accountProperties.getAccounts())
                .filter(account -> account.getAppId().equals(appId))
                .next();
    }

    /**
     * 根据凭据查询账号
     */
    public Mono<Account> findByCredentials(String appId, String appSecret) {
        return Flux.fromIterable(accountProperties.getAccounts())
                .filter(account -> account.getAppId().equals(appId) 
                        && account.getAppSecret().equals(appSecret))
                .next();
    }

    /**
     * 根据企信 botFullId 查询账号
     */
    public Mono<Account> findByBotFullId(String botFullId) {
        return Flux.fromIterable(accountProperties.getAccounts())
                .filter(account -> botFullId.equals(account.getBotFullId()))
                .next();
    }
}
