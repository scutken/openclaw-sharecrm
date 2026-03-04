package com.fxiaoke.sharecrm.im.gateway.service;

import lombok.Getter;

/**
 * 鉴权异常
 */
@Getter
public class AuthException extends RuntimeException {

    private final String code;

    public AuthException(String message) {
        super(message);
        this.code = "AUTH_FAILED";
    }

    public AuthException(String code, String message) {
        super(message);
        this.code = code;
    }

    public AuthException(String message, Throwable cause) {
        super(message, cause);
        this.code = "AUTH_FAILED";
    }
}
