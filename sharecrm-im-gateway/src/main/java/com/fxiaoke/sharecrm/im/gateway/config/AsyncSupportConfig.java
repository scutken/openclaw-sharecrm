package com.fxiaoke.sharecrm.im.gateway.config;

import org.springframework.boot.autoconfigure.web.servlet.DispatcherServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.DispatcherServlet;

/**
 * 异步支持配置
 * 
 * 解决 WAR 部署到外部 Tomcat 时 SSE 不工作的问题。
 * 嵌入式 Tomcat 会自动启用异步支持，但外部 Tomcat 需要显式配置。
 */
@Configuration
public class AsyncSupportConfig {

    @Bean
    public DispatcherServletRegistrationBean dispatcherServletRegistration(DispatcherServlet dispatcherServlet) {
        DispatcherServletRegistrationBean registration = 
            new DispatcherServletRegistrationBean(dispatcherServlet, "/");
        registration.setAsyncSupported(true);
        registration.setName("dispatcherServlet");
        registration.setLoadOnStartup(1);
        return registration;
    }
}
