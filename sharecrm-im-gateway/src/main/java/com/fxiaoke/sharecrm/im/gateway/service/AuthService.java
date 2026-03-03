package com.fxiaoke.sharecrm.im.gateway.service;

import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Base64;

/**
 * 鉴权服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AccountService accountService;

    /**
     * 验证 Token（Base64 解码后验证 appId:appSecret）
     * 
     * Token 格式：Base64Encode(appId + ":" + appSecret)
     * 
     * @param token Base64 编码的凭据
     * @return 验证成功返回 Account，失败返回错误
     */
    public Mono<Account> validateToken(String token) {
        try {
            if (token == null || token.isEmpty()) {
                return Mono.error(new AuthException("Token 不能为空"));
            }
            
            String decoded = new String(Base64.getDecoder().decode(token));
            String[] parts = decoded.split(":", 2);
            
            if (parts.length != 2) {
                return Mono.error(new AuthException("Token 格式错误"));
            }
            
            String appId = parts[0];
            String appSecret = parts[1];
            
            return authenticate(appId, appSecret)
                .flatMap(result -> result.isSuccess()
                    ? Mono.just(result.getAccount())
                    : Mono.error(new AuthException(result.getMessage())));
        } catch (IllegalArgumentException e) {
            return Mono.error(new AuthException("Token Base64 解码失败"));
        } catch (Exception e) {
            return Mono.error(new AuthException("Token 验证失败: " + e.getMessage()));
        }
    }

    /**
     * 验证凭据（响应式版本）
     */
    public Mono<AuthResult> authenticate(String appId, String appSecret) {
        if (appId == null || appSecret == null) {
            return Mono.just(AuthResult.failure("appId 和 appSecret 不能为空"));
        }

        return accountService.findByCredentials(appId, appSecret)
                .map(account -> {
                    if (!Boolean.TRUE.equals(account.getEnabled())) {
                        log.warn("账号已禁用: appId={}", appId);
                        return AuthResult.failure("账号已禁用");
                    }
                    log.info("鉴权成功: appId={}, botName={}", appId, account.getBotName());
                    return AuthResult.success(account);
                })
                .defaultIfEmpty(AuthResult.failure("appId 或 appSecret 错误"))
                .doOnNext(result -> {
                    if (!result.isSuccess()) {
                        log.warn("鉴权失败: appId={}, reason={}", appId, result.getMessage());
                    }
                });
    }

    /**
     * 鉴权结果
     */
    @Data
    @Builder
    public static class AuthResult {
        private boolean success;
        private String message;
        private Account account;

        public static AuthResult success(Account account) {
            return AuthResult.builder()
                    .success(true)
                    .account(account)
                    .build();
        }

        public static AuthResult failure(String message) {
            return AuthResult.builder()
                    .success(false)
                    .message(message)
                    .build();
        }
    }
}
