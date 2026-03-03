package com.fxiaoke.sharecrm.im.gateway.service;

import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 账号服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountRepository accountRepository;

    /**
     * 创建账号
     */
    public Mono<Account> createAccount(String botName) {
        Account account = Account.builder()
                .appId(generateAppId())
                .appSecret(generateAppSecret())
                .botName(botName)
                .enabled(true)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        return accountRepository.save(account)
                .doOnSuccess(a -> log.info("创建账号成功: appId={}, botName={}", a.getAppId(), a.getBotName()));
    }

    /**
     * 获取所有账号
     */
    public Flux<Account> listAccounts() {
        return accountRepository.findAll();
    }

    /**
     * 删除账号
     */
    public Mono<Void> deleteAccount(Long id) {
        return accountRepository.deleteById(id)
                .doOnSuccess(v -> log.info("删除账号: id={}", id));
    }

    /**
     * 重新生成密钥
     */
    public Mono<Account> regenerateSecret(Long id) {
        return accountRepository.findById(id)
                .flatMap(account -> {
                    account.setAppSecret(generateAppSecret());
                    account.setUpdatedAt(LocalDateTime.now());
                    return accountRepository.save(account);
                })
                .doOnSuccess(a -> log.info("重新生成密钥: appId={}", a.getAppId()));
    }

    /**
     * 根据 appId 查询账号
     */
    public Mono<Account> findByAppId(String appId) {
        return accountRepository.findByAppId(appId);
    }

    /**
     * 根据凭据查询账号
     */
    public Mono<Account> findByCredentials(String appId, String appSecret) {
        return accountRepository.findByAppIdAndAppSecret(appId, appSecret);
    }

    /**
     * 生成 appId
     */
    private String generateAppId() {
        return "app-" + UUID.randomUUID().toString().substring(0, 8);
    }

    /**
     * 生成 appSecret
     */
    private String generateAppSecret() {
        return "sk-" + UUID.randomUUID().toString().replace("-", "");
    }
}
