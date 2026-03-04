package com.fxiaoke.sharecrm.im.gateway.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

import java.awt.*;
import java.net.URI;

/**
 * 应用启动监听器 - 启动后打开欢迎页
 */
@Slf4j
@Component
public class ApplicationStartupListener implements ApplicationListener<ApplicationReadyEvent> {

    @Value("${server.port:8099}")
    private int port;

    @Override
    public void onApplicationEvent(ApplicationReadyEvent event) {
        String url = "http://localhost:" + port;

        log.info("========================================");
        log.info("  ShareCRM IM Gateway started!");
        log.info("  访问地址: {}", url);
        log.info("========================================");

        // 尝试自动打开浏览器
        if (Desktop.isDesktopSupported()) {
            try {
                Desktop.getDesktop().browse(new URI(url));
                log.info("Browser opened automatically");
            } catch (Exception e) {
                log.info("Failed to open browser, please visit: {}", url);
            }
        } else {
            log.info("Browser not supported, please visit: {}", url);
        }
    }
}
