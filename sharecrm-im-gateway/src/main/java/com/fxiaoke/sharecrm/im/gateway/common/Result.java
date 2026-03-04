package com.fxiaoke.sharecrm.im.gateway.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 统一响应结果
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Result<T> {

    private int code;
    private String msg;
    private T data;

    /**
     * 成功（无数据）
     */
    public static Result<Void> success() {
        return Result.<Void>builder()
                .code(ErrorCode.SUCCESS.getCode())
                .msg(ErrorCode.SUCCESS.getMessage())
                .build();
    }

    /**
     * 成功（带数据）
     */
    public static <T> Result<T> success(T data) {
        return Result.<T>builder()
                .code(ErrorCode.SUCCESS.getCode())
                .msg(ErrorCode.SUCCESS.getMessage())
                .data(data)
                .build();
    }

    /**
     * 失败（ErrorCode）
     */
    public static Result<Void> error(ErrorCode errorCode) {
        return Result.<Void>builder()
                .code(errorCode.getCode())
                .msg(errorCode.getMessage())
                .build();
    }

    /**
     * 失败（ErrorCode + 自定义消息）
     */
    public static Result<Void> error(ErrorCode errorCode, String message) {
        return Result.<Void>builder()
                .code(errorCode.getCode())
                .msg(message)
                .build();
    }

    /**
     * 失败（自定义 code 和 message）
     */
    public static Result<Void> error(int code, String message) {
        return Result.<Void>builder()
                .code(code)
                .msg(message)
                .build();
    }
}
