package com.fxiaoke.sharecrm.im.gateway.controller.open;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * AccessToken 响应
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthTokenResponse {
    private String accessToken;
    private long expiresIn;
    private String tokenType;
}
