package com.fxiaoke.sharecrm.im.gateway.controller.open;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Bot 发送消息到企信的响应
 */
public class SendMessageResponse {

    @JsonProperty("message_id")
    private String messageId;

    private boolean success;

    private String error;

    public SendMessageResponse() {
    }

    public SendMessageResponse(String messageId, boolean success, String error) {
        this.messageId = messageId;
        this.success = success;
        this.error = error;
    }

    public static SendMessageResponse ok(String messageId) {
        return new SendMessageResponse(messageId, true, null);
    }

    public static SendMessageResponse fail(String error) {
        return new SendMessageResponse(null, false, error);
    }

    public String getMessageId() {
        return messageId;
    }

    public void setMessageId(String messageId) {
        this.messageId = messageId;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}
