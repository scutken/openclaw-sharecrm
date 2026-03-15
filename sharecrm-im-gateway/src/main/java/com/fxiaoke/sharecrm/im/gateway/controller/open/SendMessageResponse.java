package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Bot 发送消息到企信的响应
 */
public class SendMessageResponse {

    @JsonProperty("message_id")
    private String messageId;

    public SendMessageResponse() {
    }

    public SendMessageResponse(String messageId) {
        this.messageId = messageId;
    }

    public static SendMessageResponse ok(String messageId) {
        return new SendMessageResponse(messageId);
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }
}
