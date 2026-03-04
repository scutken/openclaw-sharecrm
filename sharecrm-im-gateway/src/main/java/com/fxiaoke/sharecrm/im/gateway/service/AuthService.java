package com.fxiaoke.sharecrm.im.gateway.service;

import cn.hutool.jwt.JWT;
import cn.hutool.jwt.JWTUtil;
import cn.hutool.jwt.JWTValidator;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.Date;

/**
 * 鉴权服务
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final AccountService accountService;

    /**
     * JWT 密钥（固定值，避免重启后 token 失效）
     */
    private static final byte[] JWT_SECRET_KEY = "sharecrm&&im&&gateway--666".getBytes();

    /**
     * Token 有效期（秒）
     */
    private static final long TOKEN_EXPIRES_IN = 7200;

    /**
     * 生成 AccessToken
     *
     * @param account 账号信息
     * @return Token 信息
     */
    public TokenInfo generateAccessToken(Account account) {
        Date now = new Date();
        Date expiration = new Date(now.getTime() + TOKEN_EXPIRES_IN * 1000);

        String token = JWT.create()
                .setSubject(account.getAppId())
                .setIssuedAt(now)
                .setExpiresAt(expiration)
                .setKey(JWT_SECRET_KEY)
                .sign();

        return TokenInfo.builder()
                .accessToken(token)
                .expiresIn(TOKEN_EXPIRES_IN)
                .tokenType("Bearer")
                .build();
    }

    /**
     * 验证 AccessToken（JWT 格式）
     *
     * @param token JWT AccessToken
     * @return 验证成功返回 Account，失败返回错误
     */
    public Mono<Account> validateAccessToken(String token) {
        try {
            if (token == null || token.isEmpty()) {
                return Mono.error(new AuthException("TOKEN_INVALID", "Token 不能为空"));
            }

            JWT jwt = JWTUtil.parseToken(token);
            if (!jwt.setKey(JWT_SECRET_KEY).verify()) {
                return Mono.error(new AuthException("TOKEN_INVALID", "Token 签名无效"));
            }

            try {
                JWTValidator.of(jwt).validateDate();
            } catch (Exception e) {
                return Mono.error(new AuthException("TOKEN_EXPIRED", "Token 已过期"));
            }

            String appId = (String) jwt.getPayload("sub");
            if (appId == null) {
                return Mono.error(new AuthException("TOKEN_INVALID", "Token 无效"));
            }

            // 查询账号信息并验证状态
            return accountService.findByAppId(appId)
                    .switchIfEmpty(Mono.error(new AuthException("AUTH_FAILED", "账号不存在")))
                    .flatMap(account -> {
                        if (!Boolean.TRUE.equals(account.getEnabled())) {
                            log.warn("账号已禁用: appId={}", appId);
                            return Mono.error(new AuthException("ACCOUNT_DISABLED", "账号已禁用"));
                        }
                        log.debug("Token 验证成功: appId={}", appId);
                        return Mono.just(account);
                    });
        } catch (Exception e) {
            log.warn("Token 解析失败: {}", e.getMessage());
            return Mono.error(new AuthException("TOKEN_INVALID", "Token 无效或已过期"));
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
                    log.info("鉴权成功: appId={}", appId);
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
     * Token 信息
     */
    @Data
    @Builder
    public static class TokenInfo {
        private String accessToken;
        private long expiresIn;
        private String tokenType;
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
