package com.fxiaoke.sharecrm.im.gateway.controller.open;

import cn.hutool.core.thread.ThreadUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;

/**
 * Bot SSE 控制器
 * <p>
 * 替代 BotWebSocketHandler，提供 SSE 长连接支持
 * 路径: GET /im-gateway/bot/events?token={accessToken}
 * <p>
 * 协议说明：
 * - 连接即鉴权，token 放 URL query param
 * - 事件类型: connected, ping, message, error
 * - 单设备限制，新连接会断开旧连接
 */
@Slf4j
@RestController
@RequestMapping("/im-gateway")
@RequiredArgsConstructor
public class BotSseController {

    private final ObjectMapper objectMapper;
    private final AuthService authService;
    private final SseSessionManager sseSessionManager;

    /**
     * SSE 连接超时时间（毫秒）
     * 0 表示永不超时
     */
    private static final long SSE_TIMEOUT = 0L;

    /**
     * Bot SSE 连接端点
     *
     * @param token AccessToken
     * @return SseEmitter
     */
    @GetMapping(value = "/bot/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter connect(@RequestParam("token") String token) {
        log.debug("Bot SSE connection request");

        if (token == null || token.isEmpty()) {
            log.warn("SSE connection failed: empty token");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing token parameter");
        }

        Account account;
        try {
            account = authService.validateAccessToken(token);
        } catch (AuthException e) {
            log.error("SSE connection failed: {} - {}", e.getCode(), e.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, e.getMessage());
        } catch (Exception e) {
            log.error("SSE connection failed: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid token");
        }

        String appId = account.getAppId();

        // 检查是否已有连接（单设备限制）
        if (sseSessionManager.isOnline(appId)) {
            log.warn("SSE connection conflict: appId={} already has an active connection", appId);
            // 不直接拒绝，让 registerBot 去断开旧连接
        }

        // 创建 SSE Emitter
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        ThreadUtil.execute(() -> {
                    // 注册会话
                    boolean isNew = sseSessionManager.registerBot(appId, emitter);

                    // 发送 connected 事件
                    try {
                        emitter.send(SseEmitter.event()
                                .name("connected")
                                .data(Map.of(
                                        "type", "connected",
                                        "data", Map.of("bot_id", appId)
                                )));
                        log.info("Bot SSE connected: appId={}, isNew={}", appId, isNew);
                    } catch (IOException e) {
                        log.error("Failed to send connected event: appId={}", appId);
                        sseSessionManager.unregisterBot(appId);
                        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to establish SSE connection");
                    }
                }
        );
        return emitter;
    }
}
