package com.fxiaoke.sharecrm.im.gateway.config;

import com.fxiaoke.sharecrm.im.gateway.websocket.BotWebSocketHandler;
import com.fxiaoke.sharecrm.im.gateway.websocket.SimulatorWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import org.springframework.web.reactive.socket.server.support.WebSocketHandlerAdapter;

import java.util.Map;

/**
 * WebSocket 配置
 */
@Configuration
public class WebSocketConfig {

    /**
     * WebSocket 路由映射
     */
    @Bean
    public HandlerMapping webSocketMapping(BotWebSocketHandler botHandler,
                                            SimulatorWebSocketHandler simulatorHandler) {
        return new SimpleUrlHandlerMapping(
                Map.of(
                        "/bot**", botHandler,             // Bot 连接端点 /bot{token}
                        "/ws/simulator", simulatorHandler // Web UI 模拟器连接端点
                ),
                -1
        );
    }

    /**
     * WebSocket 处理器适配器
     */
    @Bean
    public WebSocketHandlerAdapter handlerAdapter() {
        return new WebSocketHandlerAdapter();
    }
}
