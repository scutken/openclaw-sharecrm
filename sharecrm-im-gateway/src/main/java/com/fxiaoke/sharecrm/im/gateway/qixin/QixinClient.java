package com.fxiaoke.sharecrm.im.gateway.qixin;

import com.facishare.qixin.api.model.message.result.SendMessageResult;
import com.facishare.qixin.api.model.open.arg.SendOpenAgentMessageArg;
import com.facishare.qixin.api.open.OpenMessageService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 企信 REST API 客户端
 * 
 * 用于网关发送消息给企信
 */
@Slf4j
@Component
public class QixinClient {

    private final OpenMessageService openMessageService;

    @SuppressWarnings("SpringJavaInjectionPointsAutowiringInspection")
    public QixinClient(OpenMessageService openMessageService) {
        this.openMessageService = openMessageService;
    }

    /**
     * 发送消息给企信
     * 
     * @param arg 发送消息参数
     * @return 发送结果
     */
    public SendMessageResult sendMessage(SendOpenAgentMessageArg arg) {
        log.info("[Qixin send] arg={}", arg);
        return openMessageService.sendOpenAgentMessage(arg);
    }
}
