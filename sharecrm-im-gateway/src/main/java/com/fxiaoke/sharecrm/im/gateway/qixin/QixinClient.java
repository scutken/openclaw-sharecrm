package com.fxiaoke.sharecrm.im.gateway.qixin;

import cn.hutool.core.map.reference.WeakKeyConcurrentMap;
import com.facishare.qixin.api.model.AuthInfo;
import com.facishare.qixin.api.model.message.result.SendMessageResult;
import com.facishare.qixin.api.model.open.arg.SendOpenAgentMessageArg;
import com.facishare.qixin.api.model.session.Session;
import com.facishare.qixin.api.model.session.arg.SessionInfoArg;
import com.facishare.qixin.api.open.OpenMessageService;
import com.facishare.qixin.api.service.SessionService;
import com.github.trace.TraceContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 企信 REST API 客户端
 * <p>
 * 用于网关发送消息给企信
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class QixinClient {

    private final OpenMessageService openMessageService;
    private final SessionService sessionService;

    private final static Map<String, Session> qixinSessionMap = new WeakKeyConcurrentMap<>();

    public Session getSession(String ea, int userId, String appId, String sessionId) {
        return qixinSessionMap.computeIfAbsent(sessionId, (k) -> {
            try {
                SessionInfoArg arg = new SessionInfoArg();
                arg.setSessionId(sessionId);
                arg.setAuthInfo(AuthInfo.buildAuthInfoForNoAuth(ea, userId, appId, TraceContext.get().getTraceId()));
                Session sessionInfo = sessionService.getSessionInfo(arg);
                log.info("get qixin session:{}", sessionInfo);
                return sessionInfo;
            } catch (Exception e) {
                log.warn("get qixin session error", e);
            }
            return null;
        });
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
