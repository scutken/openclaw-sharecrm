package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * 账号管理 REST API
 */
@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    /**
     * 获取账号列表
     */
    @GetMapping
    public Flux<Account> list() {
        return accountService.listAccounts();
    }

    /**
     * 创建账号
     */
    @PostMapping
    public Mono<Account> create(@RequestBody CreateAccountRequest request) {
        return accountService.createAccount(request.getBotName());
    }

    /**
     * 删除账号
     */
    @DeleteMapping("/{id}")
    public Mono<Void> delete(@PathVariable Long id) {
        return accountService.deleteAccount(id);
    }

    /**
     * 重新生成密钥
     */
    @PutMapping("/{id}/regenerate")
    public Mono<Account> regenerateSecret(@PathVariable Long id) {
        return accountService.regenerateSecret(id);
    }

    /**
     * 创建账号请求
     */
    @Data
    public static class CreateAccountRequest {
        private String botName;
    }
}
