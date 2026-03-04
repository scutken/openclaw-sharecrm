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
     * @return 验证成功返回 Account，失败抛出 AuthException
     */
    public Account validateAccessToken(String token) {
        try {
            if (token == null || token.isEmpty()) {
                throw new AuthException("TOKEN_INVALID", "Token cannot be empty");
            }

            JWT jwt = JWTUtil.parseToken(token);
            if (!jwt.setKey(JWT_SECRET_KEY).verify()) {
                throw new AuthException("TOKEN_INVALID", "Invalid token signature");
            }

            try {
                JWTValidator.of(jwt).validateDate();
            } catch (Exception e) {
                throw new AuthException("TOKEN_EXPIRED", "Token expired");
            }

            String appId = (String) jwt.getPayload("sub");
            if (appId == null) {
                throw new AuthException("TOKEN_INVALID", "Invalid token");
            }

            // 查询账号信息并验证状态
            Account account = accountService.findByAppId(appId)
                    .orElseThrow(() -> new AuthException("AUTH_FAILED", "Account not found"));

            if (!Boolean.TRUE.equals(account.getEnabled())) {
                log.warn("Account disabled: appId={}", appId);
                throw new AuthException("ACCOUNT_DISABLED", "Account disabled");
            }

            log.debug("Token validated: appId={}", appId);
            return account;
        } catch (AuthException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Token parse failed: {}", e.getMessage());
            throw new AuthException("TOKEN_INVALID", "Invalid or expired token");
        }
    }

    /**
     * 验证凭据
     */
    public AuthResult authenticate(String appId, String appSecret) {
        if (appId == null || appSecret == null) {
            return AuthResult.failure("appId and appSecret cannot be empty");
        }

        return accountService.findByCredentials(appId, appSecret)
                .map(account -> {
                    if (!Boolean.TRUE.equals(account.getEnabled())) {
                        log.warn("Account disabled: appId={}", appId);
                        return AuthResult.failure("Account disabled");
                    }
                    log.info("Authentication successful: appId={}", appId);
                    return AuthResult.success(account);
                })
                .orElseGet(() -> {
                    log.warn("Authentication failed: appId={}, reason=Invalid appId or appSecret", appId);
                    return AuthResult.failure("Invalid appId or appSecret");
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
