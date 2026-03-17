package com.fxiaoke.sharecrm.im.gateway.qixin;

import com.facishare.qixin.api.model.open.arg.SendOpenAgentMessageArg;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ToQixinMessageTest {

    @Test
    void from_shouldMapSessionAndReplyFields() {
        QixinSessionId sessionId = QixinSessionId.of(1, "fs", "session-1", "parent-1");

        ToQixinMessage message = ToQixinMessage.from("B.fs.bot1", "fs", sessionId, "hello", 123L);

        assertEquals(1, readField(message, "env"));
        assertEquals("fs", readField(message, "ea"));
        assertEquals("session-1", readField(message, "sessionId"));
        assertEquals("parent-1", readField(message, "parentSessionId"));
        assertEquals("B.fs.bot1", readField(message, "botFullId"));
        assertEquals("hello", readField(message, "text"));
        assertEquals(123L, readField(message, "replyMessageId"));
        assertEquals(Locale.CHINA, readField(message, "locale"));
    }

    @Test
    void toSendArg_shouldApplyDefaultLocaleAndOptionalReplyId() {
        ToQixinMessage message = new ToQixinMessage();
        writeField(message, "env", 0);
        writeField(message, "ea", "fs");
        writeField(message, "sessionId", "session-2");
        writeField(message, "parentSessionId", null);
        writeField(message, "botFullId", "B.fs.bot2");
        writeField(message, "text", "world");

        SendOpenAgentMessageArg arg = message.toSendArg();

        assertEquals(0, arg.getEnv());
        assertEquals("fs", arg.getEa());
        assertEquals("session-2", arg.getSessionId());
        assertNull(arg.getParentSessionId());
        assertEquals("B.fs.bot2", arg.getBotFullId());
        assertEquals("world", arg.getAgentMessageInfo());
        assertEquals(Locale.CHINA, arg.getLocale());
        assertEquals(0L, arg.getReplyMessageId());
    }

    private static Object readField(Object target, String fieldName) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            return field.get(target);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("Failed to read field: " + fieldName, e);
        }
    }

    private static void writeField(Object target, String fieldName, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(fieldName);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("Failed to write field: " + fieldName, e);
        }
    }
}
