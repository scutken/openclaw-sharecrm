package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.service.AccountService;
import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import reactor.core.publisher.Mono;

/**
 * Web 页面控制器
 */
@Controller
@RequiredArgsConstructor
public class WebUIController {

    private final AccountService accountService;
    private final SessionManager sessionManager;

    /**
     * 首页 - 重定向到账号管理
     */
    @GetMapping("/")
    public String index() {
        return "redirect:/accounts";
    }

    /**
     * 账号管理页面
     */
    @GetMapping("/accounts")
    public Mono<String> accounts(Model model) {
        return accountService.listAccounts()
                .collectList()
                .map(accounts -> {
                    model.addAttribute("accounts", accounts);
                    model.addAttribute("onlineAppIds", sessionManager.getBotAppIds());
                    model.addAttribute("onlineCount", sessionManager.getBotOnlineCount());
                    return "accounts";
                });
    }

    /**
     * 消息模拟器页面
     */
    @GetMapping("/simulator")
    public Mono<String> simulator(Model model) {
        return accountService.listAccounts()
                .collectList()
                .map(accounts -> {
                    model.addAttribute("accounts", accounts);
                    model.addAttribute("onlineAppIds", sessionManager.getBotAppIds());
                    return "simulator";
                });
    }
}
