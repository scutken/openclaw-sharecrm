package com.fxiaoke.sharecrm.im.gateway.qixin;

import com.facishare.qixin.api.model.open.arg.SendOpenAgentMessageArg;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Locale;

/**
 * 发往企信的消息命令
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ToQixinMessage {

    private int env;
    private String ea;
    private String sessionId;
    private String parentSessionId;
    private String botFullId;
    private String text;
    private Long replyMessageId;
    private Locale locale;

    public SendOpenAgentMessageArg toSendArg() {
        SendOpenAgentMessageArg arg = new SendOpenAgentMessageArg();
        arg.setEnv(env);
        arg.setEa(ea);
        arg.setSessionId(sessionId);
        arg.setParentSessionId(parentSessionId);
        arg.setBotFullId(botFullId);
        arg.setAgentMessageInfo(text);
        arg.setLocale(locale != null ? locale : Locale.CHINA);
        if (replyMessageId != null) {
            arg.setReplyMessageId(replyMessageId);
        }
        return arg;
    }

    public static ToQixinMessage from(String botFullId, String ea, QixinSessionId sessionId,
                                      String text, Long replyMessageId) {
        return ToQixinMessage.builder()
                .env(sessionId.getEnv())
                .ea(ea)
                .sessionId(sessionId.getSessionId())
                .parentSessionId(sessionId.getParentSessionId())
                .botFullId(botFullId)
                .text(text)
                .replyMessageId(replyMessageId)
                .locale(Locale.CHINA)
                .build();
    }
}
