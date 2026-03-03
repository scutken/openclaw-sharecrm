package com.fxiaoke.sharecrm.im.gateway.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Map;

/**
 * 健康检查 API
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    /**
     * Ping - 测试网络连通性
     */
    @GetMapping("/ping")
    public Mono<Map<String, Object>> ping() {
        return Mono.just(Map.of(
                "status", "ok",
                "service", "sharecrm-im-gateway",
                "timestamp", Instant.now().toEpochMilli()
        ));
    }
}
