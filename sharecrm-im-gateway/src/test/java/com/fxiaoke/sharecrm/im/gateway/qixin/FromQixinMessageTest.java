package com.fxiaoke.sharecrm.im.gateway.qixin;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FromQixinMessageTest {

    @Test
    void helpers_shouldEncodeChatIdAndExtractUserName() {
        FromQixinMessage message = new FromQixinMessage();
        TestReflectionHelper.writeField(message, "env", 0);
        TestReflectionHelper.writeField(message, "ea", "fs");
        TestReflectionHelper.writeField(message, "sessionId", "session-1");
        TestReflectionHelper.writeField(message, "parentSessionId", "parent-1");
        TestReflectionHelper.writeField(message, "senderFullId", "E.fs.7618");

        assertEquals("0:fs:session-1:parent-1", message.encodeChatId());
        assertEquals("7618", message.extractUserName());
        assertEquals(7618, message.extractUserId());
    }

    @Test
    void helpers_shouldFallbackForNullOrUnexpectedSender() {
        FromQixinMessage message = new FromQixinMessage();
        assertEquals("Unknown User", message.extractUserName());
        assertEquals(0, message.extractUserId());

        TestReflectionHelper.writeField(message, "senderFullId", "plain-user");
        assertEquals("plain-user", message.extractUserName());
        assertEquals(0, message.extractUserId());
    }
}
