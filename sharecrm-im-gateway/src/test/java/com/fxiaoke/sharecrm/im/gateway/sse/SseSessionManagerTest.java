package com.fxiaoke.sharecrm.im.gateway.sse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.TestReflectionHelper;
import com.fxiaoke.sharecrm.im.gateway.qixin.FromQixinMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SseSessionManagerTest {

    private SseSessionManager sessionManager;

    @BeforeEach
    void setUp() {
        sessionManager = new SseSessionManager(new ObjectMapper());
    }

    @Test
    void registerAndUnregister_shouldManageOnlineState() {
        CapturingEmitter emitter = new CapturingEmitter();

        boolean first = sessionManager.registerBot("app-1", emitter, "1.2.0");
        boolean second = sessionManager.registerBot("app-1", new CapturingEmitter(), "1.0.0");

        assertTrue(first);
        assertFalse(second);
        assertTrue(sessionManager.isOnline("app-1"));
        assertEquals(1, sessionManager.getBotOnlineCount());
        assertEquals(List.of("app-1"), sessionManager.getBotAppIds());

        sessionManager.unregisterBot("app-1");
        assertFalse(sessionManager.isOnline("app-1"));
    }

    @Test
    void sendQixinMessageToBot_shouldSerializeLegacyAndNewProtocol() {
        CapturingEmitter legacy = new CapturingEmitter();
        CapturingEmitter modern = new CapturingEmitter();
        sessionManager.registerBot("legacy", legacy, "1.0.0");
        sessionManager.registerBot("modern", modern, "1.2.0");

        FromQixinMessage message = new FromQixinMessage();
        TestReflectionHelper.writeField(message, "env", 0);
        TestReflectionHelper.writeField(message, "ea", "fs");
        TestReflectionHelper.writeField(message, "sessionId", "session-1");
        TestReflectionHelper.writeField(message, "parentSessionId", "parent-1");
        TestReflectionHelper.writeField(message, "botFullId", "B.fs.bot1");
        TestReflectionHelper.writeField(message, "messageId", 100L);
        TestReflectionHelper.writeField(message, "messageType", "T");
        TestReflectionHelper.writeField(message, "replyMessageId", 200L);
        TestReflectionHelper.writeField(message, "messageTimestamp", 1710000000000L);

        sessionManager.sendQixinMessageToBot("legacy", "0:fs:session-1:parent-1", "hello", "7618", "Alice", "direct", message);
        sessionManager.sendQixinMessageToBot("modern", "0:fs:session-1:parent-1", "hello", "7618", "Alice", "group", message);

        String legacyPayload = legacy.messages.getFirst();
        String modernPayload = modern.messages.getFirst();
        assertTrue(legacyPayload.contains("\"type\":\"message\""));
        assertTrue(legacyPayload.contains("\"version\":null"));
        assertTrue(modernPayload.contains("\"version\":\"1.0\""));
        assertTrue(modernPayload.contains("\"bot_full_id\":\"B.fs.bot1\""));
        assertTrue(modernPayload.contains("\"chat_type\":\"group\""));
    }

    @Test
    void sendHeartbeat_shouldRemoveBrokenEmitters() {
        FailingEmitter failingEmitter = new FailingEmitter();
        sessionManager.registerBot("app-1", failingEmitter, "1.2.0");

        sessionManager.sendHeartbeat();

        assertFalse(sessionManager.isOnline("app-1"));
    }

    static class CapturingEmitter extends SseEmitter {
        final List<String> messages = new ArrayList<>();

        CapturingEmitter() {
            super(0L);
        }

        @Override
        public synchronized void send(SseEventBuilder builder) throws IOException {
            try {
                Object payload = TestReflectionHelper.readField(builder, "dataToSend");
                @SuppressWarnings("unchecked")
                var set = (java.util.Set<ResponseBodyEmitter.DataWithMediaType>) payload;
                StringBuilder sb = new StringBuilder();
                for (ResponseBodyEmitter.DataWithMediaType item : set) {
                    sb.append(String.valueOf(item.getData()));
                }
                messages.add(sb.toString());
            } catch (Exception e) {
                throw new IOException(e);
            }
        }
    }

    static class FailingEmitter extends SseEmitter {
        FailingEmitter() {
            super(0L);
        }

        @Override
        public synchronized void send(SseEventBuilder builder) throws IOException {
            throw new IOException("broken pipe");
        }
    }
}
