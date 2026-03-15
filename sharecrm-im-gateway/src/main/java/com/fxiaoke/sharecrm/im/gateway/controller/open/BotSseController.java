package com.fxiaoke.sharecrm.im.gateway.controller.open;

import cn.hutool.core.thread.ThreadUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.entity.Account;
import com.fxiaoke.sharecrm.im.gateway.service.AuthException;
import com.fxiaoke.sharecrm.im.gateway.service.AuthService;
import com.fxiaoke.sharecrm.im.gateway.sse.SseSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
    private final AuthService authService;
    private final SseSessionManager sseSessionManager;

    /**
     * SSE 连接超时时间（毫秒）
     * 默认 5 分钟，0 表示永不超时
     */
    @Value("${sse.timeout:300000}")
    private long sseTimeout;

    /**
     * SSE 连接最大存活时间（毫秒）
     * 超过此时间后连接自动断开，强制重连
     * 默认 30 分钟
     */
    @Value("${sse.max-lifetime:1800000}")
    private long sseMaxLifetime;

    /**
     * 最低支持超时功能的版本（v1.2.0）
     */
    private static final String MIN_VERSION_FOR_TIMEOUT = "1.2.0";

    /**
     * Bot SSE 连接端点
     *
     * @param token    AccessToken
     * @param version  插件版本（可选），默认为 v1.0.0，>= v1.2.0 启用超时
     * @return SseEmitter
     */
    @GetMapping(value = "/bot/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter connect(
            @RequestParam("token") String token,
            @RequestParam(value = "version", required = false, defaultValue = "v1.0.0") String version) {
        log.debug("Bot SSE connection request, version={}", version);

        // 解析版本号，判断是否启用超时
        boolean enableTimeout = isVersionGreaterOrEqual(version, MIN_VERSION_FOR_TIMEOUT);
        log.info("Plugin version: {}, enableTimeout: {}", version, enableTimeout);

        // 根据版本决定超时配置
        long effectiveTimeout = enableTimeout ? sseTimeout : 0L;
        long effectiveMaxLifetime = enableTimeout ? sseMaxLifetime : 0L;

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

        // 创建 SSE Emitter，使用配置的超时时间
        SseEmitter emitter = new SseEmitter(effectiveTimeout);

        ThreadUtil.execute(() -> {
                    // 注册会话，传递客户端版本
                    boolean isNew = sseSessionManager.registerBot(appId, emitter, version);

                    // 发送 connected 事件
                    try {
                        emitter.send(SseEmitter.event()
                                .name("connected")
                                .data(Map.of(
                                        "type", "connected",
                                        "data", Map.of(
                                                "bot_id", appId,
                                                "version", version,
                                                "max_lifetime", effectiveMaxLifetime
                                        )
                                )));
                        log.info("Bot SSE connected: appId={}, isNew={}, version={}, timeout={}ms, maxLifetime={}ms",
                                appId, isNew, version, effectiveTimeout, effectiveMaxLifetime);
                    } catch (IOException e) {
                        log.error("Failed to send connected event: appId={}", appId);
                        sseSessionManager.unregisterBot(appId);
                        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to establish SSE connection");
                    }
                }
        );
        return emitter;
    }

    /**
     * 比较版本号，判断 currentVersion >= minVersion
     * 支持格式：v1.0.0, 1.0.0, v1.2.0, 1.2.0
     */
    private boolean isVersionGreaterOrEqual(String currentVersion, String minVersion) {
        try {
            // 去除 v 前缀
            String current = currentVersion.replaceFirst("^v", "");
            String min = minVersion.replaceFirst("^v", "");

            String[] currentParts = current.split("\\.");
            String[] minParts = min.split("\\.");

            int maxLen = Math.max(currentParts.length, minParts.length);

            for (int i = 0; i < maxLen; i++) {
                int currentPart = i < currentParts.length ? parseIntSafe(currentParts[i]) : 0;
                int minPart = i < minParts.length ? parseIntSafe(minParts[i]) : 0;

                if (currentPart > minPart) {
                    return true;
                } else if (currentPart < minPart) {
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            log.warn("Failed to parse version: current={}, min={}, default to false", currentVersion, minVersion);
            return false;
        }
    }

    private int parseIntSafe(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9].*", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
