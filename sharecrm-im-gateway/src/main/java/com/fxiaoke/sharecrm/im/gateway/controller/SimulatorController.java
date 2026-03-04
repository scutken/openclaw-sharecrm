package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 模拟器辅助接口（内部接口）
 * 
 * 提供会话查询等辅助功能
 */
@Slf4j
@RestController
@RequestMapping("/simulator")
@RequiredArgsConstructor
public class SimulatorController {

    private final SessionManager sessionManager;

    /**
     * 获取在线会话
     */
    @GetMapping("/sessions")
    public SessionsResponse getSessions() {
        SessionsResponse response = new SessionsResponse();
        response.setOnlineCount(sessionManager.getBotOnlineCount());
        response.setAppIds(sessionManager.getBotAppIds());
        return response;
    }

    /**
     * 会话响应
     */
    @Data
    public static class SessionsResponse {
        private int onlineCount;
        private List<String> appIds;
    }
}
