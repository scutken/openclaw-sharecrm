package com.fxiaoke.sharecrm.im.gateway.qixin;

import com.facishare.qixin.api.model.message.result.SendMessageResult;
import com.facishare.qixin.api.open.OpenMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 企信 REST API 客户端
 * <p>
 * 用于网关发送消息给企信
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QixinClient {

    @SuppressWarnings("SpringJavaInjectionPointsAutowiringInspection")
    private final OpenMessageService openMessageService;

    /**
     * 发送消息给企信
     *
     * @param message 出站消息命令
     * @return 发送结果
     */
    public SendMessageResult sendMessage(ToQixinMessage message) {
        var arg = message.toSendArg();
        log.info("[Qixin send] arg={}", arg);
        return openMessageService.sendOpenAgentMessage(arg);
    }
}
