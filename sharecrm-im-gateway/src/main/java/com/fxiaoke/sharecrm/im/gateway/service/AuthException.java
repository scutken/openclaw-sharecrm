package com.fxiaoke.sharecrm.im.gateway.service;

/**
 * 鉴权异常
 */
public class AuthException extends RuntimeException {

    public AuthException(String message) {
        super(message);
    }

    public AuthException(String message, Throwable cause) {
        super(message, cause);
    }
}
