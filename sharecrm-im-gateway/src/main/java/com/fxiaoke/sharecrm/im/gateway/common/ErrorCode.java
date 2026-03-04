package com.fxiaoke.sharecrm.im.gateway.common;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 统一错误码
 */
@Getter
@AllArgsConstructor
public enum ErrorCode {

    // 成功
    SUCCESS(0, "success"),

    // 参数错误 400xx
    PARAM_MISSING(40001, "Required parameter is missing"),
    PARAM_INVALID(40002, "Invalid parameter"),
    AUTH_HEADER_MISSING(40003, "Missing or invalid Authorization header"),
    ACCOUNT_DISABLED(40004, "Account disabled"),
    ACCOUNT_NOT_FOUND(40005, "Account not found"),

    // 认证错误 401xx
    TOKEN_INVALID(40100, "Invalid token"),
    TOKEN_EXPIRED(40101, "Token expired"),

    // 服务错误 500xx
    BOT_NOT_CONNECTED(50001, "Bot not connected"),
    INTERNAL_ERROR(50000, "Internal server error");

    private final int code;
    private final String message;
}
