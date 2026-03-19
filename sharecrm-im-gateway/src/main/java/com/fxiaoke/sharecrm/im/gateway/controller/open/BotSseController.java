package com.fxiaoke.sharecrm.im.gateway.controller.open;

import cn.hutool.core.thread.ThreadUtil;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import com.fxiaoke.sharecrm.im.gateway.sse.SsePayloads.Connected;
import com.fxiaoke.sharecrm.im.gateway.sse.SsePayloads.ConnectedData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
/**
 * Bot SSE 控制器
 * <p>
 * 替代 BotWebSocketHandler，提供 SSE 长连接支持
 * 路径: GET /im-gateway/bot/events?token={accessToken}
 * <p>
 * 协议说明：
 * - 连接即鉴权，token 放 URL query param
 * - 事件类型: connected, message, reset
 * - 心跳使用 SSE comment，不作为业务事件下发
 * - 单设备限制，新连接会断开旧连接
 */
@Slf4j
@RestController
@RequestMapping("/im-gateway")
@RequiredArgsConstructor
public class BotSseController {
    private final AuthService authService;
    private final SseSessionManager sseSessionManager;

    /**
     * SSE 连接最大存活时间（毫秒）
     * 超过此时间后服务端主动断开，客户端应按标准机制重连
     * 默认 30 分钟
     */
    @Value("${sse.max-lifetime:1800000}")
    private long sseMaxLifetime;

    /**
     * 服务端建议重连延迟（毫秒）
     */
    @Value("${sse.retry-delay:1000}")
    private long sseRetryDelay;

    private static final String DEFAULT_CLIENT_VERSION = "v1.0.0";
    private static final String CURRENT_PROTOCOL_VERSION = "1.2.0";

    /**
     * Bot SSE 连接端点
     *
     * @param token    AccessToken
     * @param version  插件版本（可选），默认为 v1.0.0
     * @return SseEmitter
     */
    @GetMapping(value = "/bot/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter connect(
            @RequestParam("token") String token,
            @RequestParam(value = "version", required = false, defaultValue = DEFAULT_CLIENT_VERSION) String version,
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        log.debug("Bot SSE connection request, version={}", version);

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

        // SSE 连接本身不设置 async timeout，生命周期由 max_lifetime 与客户端重连机制控制
        SseEmitter emitter = new SseEmitter(0L);

        ThreadUtil.execute(() -> {
                    // 注册会话，传递客户端版本
                    boolean isNew = sseSessionManager.registerBot(appId, emitter, version);

                    try {
                        emitter.send(SseEmitter.event()
                                .reconnectTime(sseRetryDelay)
                                .name("connected")
                                .data(Connected.builder()
                                        .type("connected")
                                        .data(ConnectedData.builder()
                                                .botFullId(account.getBotFullId())
                                                .protocolVersion(CURRENT_PROTOCOL_VERSION)
                                                .clientVersion(version)
                                                .maxLifetime(sseMaxLifetime)
                                                .retry(sseRetryDelay)
                                                .build())
                                        .build()));
                        sseSessionManager.replayMissedEvents(appId, emitter, lastEventId, version);
                        log.info("Bot SSE connected: appId={}, isNew={}, version={}, maxLifetime={}ms, lastEventId={}",
                                appId, isNew, version, sseMaxLifetime, lastEventId);
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
