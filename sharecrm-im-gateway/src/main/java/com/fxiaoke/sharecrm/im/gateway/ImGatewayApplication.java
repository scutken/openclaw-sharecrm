package com.fxiaoke.sharecrm.im.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration;
import org.springframework.context.annotation.ImportResource;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * ShareCRM IM Gateway 应用启动类
 *
 */
@SpringBootApplication(
        exclude = {MongoAutoConfiguration.class})
@ImportResource(value = "classpath:/spring/fs-qixin-rest-client.xml")
@EnableScheduling
public class ImGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(ImGatewayApplication.class, args);
    }
}
