package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.common.ErrorCode;
import com.fxiaoke.sharecrm.im.gateway.common.Result;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 账号管理接口
 */
@Slf4j
@RestController
@RequestMapping("/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    /**
     * 保存账号请求
     */
    @Data
    public static class SaveAccountRequest {
        /**
         * 会话所属企业ea
         */
        private String ea;
        /**
         * 企信侧 Bot 完整 ID
         * 格式示例：B.ea.botId
         */
        private String botFullId;
        /**
         * Gateway 接入应用 ID
         */
        private String appId;
        /**
         * Gateway 接入密钥
         */
        private String appSecret;
    }

    /**
     * 删除账号请求
     */
    @Data
    public static class DeleteAccountRequest {
        /**
         * 会话所属企业ea
         */
        private String ea;
        /**
         * 企信侧 Bot 完整 ID
         * 格式示例：B.ea.botId
         */
        private String botFullId;
    }

    /**
     * 保存账号（新增或更新，以 ea + botFullId 为唯一键）
     */
    @PostMapping("/save")
    public Result<Void> saveAccount(@RequestBody SaveAccountRequest request) {
        // 参数校验
        if (!StringUtils.hasText(request.getEa())) {
            return Result.error(ErrorCode.PARAM_MISSING, "ea is required");
        }
        if (!StringUtils.hasText(request.getBotFullId())) {
            return Result.error(ErrorCode.PARAM_MISSING, "botFullId is required");
        }
        if (!StringUtils.hasText(request.getAppId())) {
            return Result.error(ErrorCode.PARAM_MISSING, "appId is required");
        }
        if (!StringUtils.hasText(request.getAppSecret())) {
            return Result.error(ErrorCode.PARAM_MISSING, "appSecret is required");
        }

        Account account = Account.builder()
                .ea(request.getEa())
                .botFullId(request.getBotFullId())
                .appId(request.getAppId())
                .appSecret(request.getAppSecret())
                .enabled(true)
                .build();

        accountService.saveAccount(account);
        log.info("Account saved: ea={}, botFullId={}", request.getEa(), request.getBotFullId());
        return Result.success();
    }

    /**
     * 删除账号（以 ea + botFullId 为唯一键）
     */
    @PostMapping("/delete")
    public Result<Void> deleteAccount(@RequestBody DeleteAccountRequest request) {
        // 参数校验
        if (!StringUtils.hasText(request.getEa())) {
            return Result.error(ErrorCode.PARAM_MISSING, "ea is required");
        }
        if (!StringUtils.hasText(request.getBotFullId())) {
            return Result.error(ErrorCode.PARAM_MISSING, "botFullId is required");
        }

        boolean deleted = accountService.deleteAccount(request.getEa(), request.getBotFullId());
        if (!deleted) {
            return Result.error(ErrorCode.ACCOUNT_NOT_FOUND);
        }
        log.info("Account deleted: ea={}, botFullId={}", request.getEa(), request.getBotFullId());
        return Result.success();
    }
}
