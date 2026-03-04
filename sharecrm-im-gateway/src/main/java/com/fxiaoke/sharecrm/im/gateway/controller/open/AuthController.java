package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * 鉴权 API - 外部接口
 * <p>
 * 路径前缀 /im-gateway 暴露公网
 */
@Slf4j
@RestController
@RequestMapping("/im-gateway")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @GetMapping("/ping")
    public Mono<String> ping() {
        return Mono.just("pong");
    }

    /**
     * 获取 AccessToken
     * <p>
     * POST /im-gateway/auth/token
     */
    @PostMapping("auth/token")
    public Mono<Map<String, Object>> getToken(@RequestBody AuthTokenRequest request) {
        if (request.getAppId() == null || request.getAppId().isEmpty()
                || request.getAppSecret() == null || request.getAppSecret().isEmpty()) {
            return Mono.just(Map.of(
                    "code", 40001,
                    "message", "appId 和 appSecret 不能为空"
            ));
        }

        return authService.authenticate(request.getAppId(), request.getAppSecret())
                .map(result -> {
                    if (result.isSuccess()) {
                        AuthService.TokenInfo tokenInfo = authService.generateAccessToken(result.getAccount());
                        log.info("Token 生成成功: appId={}", request.getAppId());
                        return Map.<String, Object>of(
                                "code", 0,
                                "data", Map.of(
                                        "accessToken", tokenInfo.getAccessToken(),
                                        "expiresIn", tokenInfo.getExpiresIn(),
                                        "tokenType", tokenInfo.getTokenType()
                                )
                        );
                    } else {
                        log.warn("Token 生成失败: appId={}, reason={}", request.getAppId(), result.getMessage());
                        int code = 40001;
                        if ("账号已禁用".equals(result.getMessage())) {
                            code = 40004;
                        }
                        return Map.<String, Object>of(
                                "code", code,
                                "message", result.getMessage()
                        );
                    }
                });
    }

    /**
     * 获取 Token 请求
     */
    @Data
    public static class AuthTokenRequest {
        private String appId;
        private String appSecret;
    }
}
