package com.fxiaoke.sharecrm.im.gateway.sse;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SsePayloadSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
            .setVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY);

    @Test
    void connectedPayload_shouldSerializeBotFullIdWithoutLegacyBotId() throws Exception {
        SsePayloads.Connected connected = new SsePayloads.Connected();
        SsePayloads.ConnectedData data = new SsePayloads.ConnectedData();
        writeField(connected, "type", "connected");
        writeField(data, "botFullId", "B.fs.bot-demo");
        writeField(data, "version", "1.2.0");
        writeField(data, "maxLifetime", 1800000L);
        writeField(connected, "data", data);

        JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(connected));

        assertEquals("connected", json.get("type").asText());
        assertEquals("B.fs.bot-demo", json.path("data").path("bot_full_id").asText());
        assertEquals("1.2.0", json.path("data").path("version").asText());
        assertEquals(1800000L, json.path("data").path("max_lifetime").asLong());
        assertFalse(json.path("data").has("bot_id"));
    }

    @Test
    void messagePayload_shouldKeepStructuredDataInSseMessage() throws Exception {
        SsePayloads.ToBotMessage payload = new SsePayloads.ToBotMessage();
        SsePayloads.SenderInfo senderInfo = new SsePayloads.SenderInfo();
        SsePayloads.TextMessage textMessage = new SsePayloads.TextMessage();
        writeField(payload, "messageId", "123");
        writeField(payload, "chatId", "0:fs:session:");
        writeField(payload, "chatType", "direct");
        writeField(senderInfo, "id", "7618");
        writeField(senderInfo, "name", "Alice");
        writeField(payload, "from", senderInfo);
        writeField(payload, "text", "你好");
        writeField(payload, "date", 1710000000L);
        writeField(textMessage, "type", "text");
        writeField(textMessage, "content", "你好");
        writeField(payload, "message", textMessage);
        writeField(payload, "timestamp", 1710000000L);
        writeField(payload, "env", 0);
        writeField(payload, "ea", "fs");
        writeField(payload, "sessionId", "session");
        writeField(payload, "botFullId", "B.fs.bot-demo");
        writeField(payload, "messageType", "T");

        SseMessage sseMessage = SseMessage.of("message", "1.0", payload);
        JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(sseMessage));

        assertEquals("message", json.get("type").asText());
        assertEquals("1.0", json.get("version").asText());
        assertEquals("123", json.path("data").path("message_id").asText());
        assertEquals("Alice", json.path("data").path("from").path("name").asText());
        assertEquals("你好", json.path("data").path("message").path("content").asText());
        assertEquals("B.fs.bot-demo", json.path("data").path("bot_full_id").asText());
        assertTrue(json.path("data").has("timestamp"));
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
