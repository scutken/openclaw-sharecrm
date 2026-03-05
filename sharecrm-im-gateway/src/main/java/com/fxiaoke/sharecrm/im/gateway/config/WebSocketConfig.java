package com.fxiaoke.sharecrm.im.gateway.config;

import com.fxiaoke.sharecrm.im.gateway.websocket.SimulatorWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 配置
 * 
 * 仅用于 Web UI 模拟器，Bot 连接使用 SSE
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final SimulatorWebSocketHandler simulatorHandler;

    public WebSocketConfig(SimulatorWebSocketHandler simulatorHandler) {
        this.simulatorHandler = simulatorHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Web UI 模拟器连接端点（内部）
        registry.addHandler(simulatorHandler, "/ws/simulator").setAllowedOrigins("*");
    }
}
