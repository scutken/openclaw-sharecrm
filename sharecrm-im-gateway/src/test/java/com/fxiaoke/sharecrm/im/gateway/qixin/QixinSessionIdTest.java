package com.fxiaoke.sharecrm.im.gateway.qixin;

import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class QixinSessionIdTest {

    @Test
    void encodeAndDecode_shouldRoundTrip() {
        QixinSessionId sessionId = QixinSessionId.of(1, "fs", "session-1", "parent-1");

        String encoded = sessionId.encode();
        QixinSessionId decoded = QixinSessionId.decode(encoded);

        assertEquals("1:fs:session-1:parent-1", encoded);
        assertEquals(1, TestReflectionHelper.readField(decoded, "env"));
        assertEquals("fs", TestReflectionHelper.readField(decoded, "ea"));
        assertEquals("session-1", TestReflectionHelper.readField(decoded, "sessionId"));
        assertEquals("parent-1", TestReflectionHelper.readField(decoded, "parentSessionId"));
    }

    @Test
    void decode_shouldSupportMissingParentSession() {
        QixinSessionId decoded = QixinSessionId.decode("0:fs:session-2:");

        assertEquals(0, TestReflectionHelper.readField(decoded, "env"));
        assertEquals("fs", TestReflectionHelper.readField(decoded, "ea"));
        assertEquals("session-2", TestReflectionHelper.readField(decoded, "sessionId"));
        assertNull(TestReflectionHelper.readField(decoded, "parentSessionId"));
    }

    @Test
    void decode_shouldRejectInvalidFormats() {
        assertThrows(IllegalArgumentException.class, () -> QixinSessionId.decode(null));
        assertThrows(IllegalArgumentException.class, () -> QixinSessionId.decode("1:fs"));
        assertThrows(IllegalArgumentException.class, () -> QixinSessionId.decode("x:fs:session:"));
    }
}
