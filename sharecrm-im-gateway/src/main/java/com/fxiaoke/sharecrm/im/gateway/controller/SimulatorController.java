package com.fxiaoke.sharecrm.im.gateway.controller;

import com.fxiaoke.sharecrm.im.gateway.websocket.SessionManager;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.UUID;

/**
 * 消息模拟器 REST API
 */
@Slf4j
@RestController
@RequestMapping("/api/simulator")
@RequiredArgsConstructor
public class SimulatorController {

    private final SessionManager sessionManager;

    /**
     * 模拟发送消息
     */
    @PostMapping("/send")
    public Mono<SimulateResponse> sendMessage(@RequestBody SimulateRequest request) {
        return Mono.fromCallable(() -> {
            var botSessionOpt = sessionManager.getBotSession(request.getAppId());
            if (botSessionOpt.isEmpty()) {
                return SimulateResponse.failure("未找到对应的连接会话，请确认插件已连接");
            }

            String messageId = "msg-" + UUID.randomUUID().toString().substring(0, 8);

            // 发送消息到 Bot
            sessionManager.sendMessageToBot(
                    request.getAppId(),
                    request.getChannelId(),
                    messageId,
                    request.getText(),
                    request.getUserId(),
                    request.getUserName()
            );

            log.info("模拟消息已发送: appId={}, channelId={}, text={}",
                    request.getAppId(), request.getChannelId(), request.getText());

            // 广播用户消息到模拟器（消息回显）
            sessionManager.broadcastUserMessageToSimulators(
                    request.getAppId(),
                    request.getChannelId(),
                    messageId,
                    request.getText(),
                    request.getUserId(),
                    request.getUserName()
            );

            return SimulateResponse.success("消息已发送", messageId);
        }).onErrorResume(e -> {
            log.error("发送模拟消息失败", e);
            return Mono.just(SimulateResponse.failure("发送失败: " + e.getMessage()));
        });
    }

    /**
     * 获取在线会话
     */
    @GetMapping("/sessions")
    public Mono<SessionsResponse> getSessions() {
        return Mono.fromCallable(() -> {
            SessionsResponse response = new SessionsResponse();
            response.setOnlineCount(sessionManager.getBotOnlineCount());
            response.setAppIds(sessionManager.getBotAppIds());
            return response;
        });
    }

    /**
     * 模拟请求
     */
    @Data
    public static class SimulateRequest {
        private String appId;
        private String chatType = "direct";
        private String channelId = "ch-001";
        private String userId = "u-1001";
        private String userName = "测试用户";
        private String text;
    }

    /**
     * 模拟响应
     */
    @Data
    public static class SimulateResponse {
        private boolean success;
        private String message;
        private String messageId;

        public static SimulateResponse success(String message, String messageId) {
            SimulateResponse r = new SimulateResponse();
            r.success = true;
            r.message = message;
            r.messageId = messageId;
            return r;
        }

        public static SimulateResponse failure(String message) {
            SimulateResponse r = new SimulateResponse();
            r.success = false;
            r.message = message;
            return r;
        }
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
