package com.fxiaoke.sharecrm.im.gateway.config;

import com.fxiaoke.sharecrm.im.gateway.websocket.BotWebSocketHandler;
import com.fxiaoke.sharecrm.im.gateway.websocket.SimulatorWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 配置
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final BotWebSocketHandler botHandler;
    private final SimulatorWebSocketHandler simulatorHandler;

    public WebSocketConfig(BotWebSocketHandler botHandler, SimulatorWebSocketHandler simulatorHandler) {
        this.botHandler = botHandler;
        this.simulatorHandler = simulatorHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Bot 连接端点 /im-gateway/bot?token={accessToken}
        registry.addHandler(botHandler, "/im-gateway/bot").setAllowedOrigins("*");
        // Web UI 模拟器连接端点（内部）
        registry.addHandler(simulatorHandler, "/ws/simulator").setAllowedOrigins("*");
    }
}
