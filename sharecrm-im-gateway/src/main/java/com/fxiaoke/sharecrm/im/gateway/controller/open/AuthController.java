package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fxiaoke.sharecrm.im.gateway.common.ErrorCode;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
    public String ping() {
        return "pong";
    }

    /**
     * 获取 AccessToken
     * <p>
     * POST /im-gateway/auth/token
     */
    @PostMapping("auth/token")
    public Result<?> getToken(@RequestBody AuthTokenRequest request) {
        if (request.getAppId() == null || request.getAppId().isEmpty()
                || request.getAppSecret() == null || request.getAppSecret().isEmpty()) {
            return Result.error(ErrorCode.PARAM_MISSING, "appId and appSecret cannot be empty");
        }

        AuthService.AuthResult result = authService.authenticate(request.getAppId(), request.getAppSecret());
        if (result.isSuccess()) {
            AuthService.TokenInfo tokenInfo = authService.generateAccessToken(result.getAccount());
            log.info("Token generated: appId={}", request.getAppId());
            return Result.success(Map.of(
                    "accessToken", tokenInfo.getAccessToken(),
                    "expiresIn", tokenInfo.getExpiresIn(),
                    "tokenType", tokenInfo.getTokenType()
            ));
        } else {
            log.warn("Token generation failed: appId={}, reason={}", request.getAppId(), result.getMessage());
            if ("Account disabled".equals(result.getMessage())) {
                return Result.error(ErrorCode.ACCOUNT_DISABLED);
            }
            return Result.error(ErrorCode.PARAM_MISSING, result.getMessage());
        }
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
