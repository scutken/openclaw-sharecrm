package com.fxiaoke.sharecrm.im.gateway.config;

import org.springframework.boot.autoconfigure.web.servlet.DispatcherServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.DispatcherServlet;

/**
 * 外部 Tomcat 部署时显式启用异步支持（SSE 等场景需要）
 */
@Configuration
public class AsyncSupportConfig {

    @Bean
    public DispatcherServletRegistrationBean dispatcherServletRegistration(DispatcherServlet dispatcherServlet) {
        DispatcherServletRegistrationBean registration = new DispatcherServletRegistrationBean(dispatcherServlet, "/");
        registration.setAsyncSupported(true);
        return registration;
    }
}
