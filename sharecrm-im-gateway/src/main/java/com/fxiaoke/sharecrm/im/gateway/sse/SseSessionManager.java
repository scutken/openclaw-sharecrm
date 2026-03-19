package com.fxiaoke.sharecrm.im.gateway.sse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.qixin.FromQixinMessage;
import com.fxiaoke.sharecrm.im.gateway.sse.SsePayloads.ToBotMessage;
import com.fxiaoke.sharecrm.im.gateway.sse.SsePayloads.Reset;
import com.fxiaoke.sharecrm.im.gateway.sse.SsePayloads.SenderInfo;
import com.fxiaoke.sharecrm.im.gateway.sse.SsePayloads.TextMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SSE 会话管理器
 *
 * 管理 Bot SSE 连接，替代 WebSocket SessionManager 的 Bot 相关功能
 * 特点：
 * 1. 单设备限制 - 同一 token 新连接会断开旧连接
 * 2. 无需消息恢复 - 断连期间消息不保留
 * 3. 心跳保活 - 服务端定期推送 ping 事件
 */
@Slf4j
@Component
public class SseSessionManager {

    private static final String DEFAULT_CLIENT_VERSION = "v1.0.0";
    private static final String MIN_VERSION_FOR_NEW_PROTOCOL = "1.2.0";

    private final ObjectMapper objectMapper;

    public SseSessionManager(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Value("${sse.max-lifetime:1800000}")
    private long sseMaxLifetime = 1800000L;

    @Value("${sse.replay-limit:200}")
    private int replayLimit = 200;

    /**
     * Bot SSE 会话
     */
    private final Map<String, BotSession> botSessions = new ConcurrentHashMap<>();

    /**
     * 每个 appId 最近可重放的消息事件
     */
    private final Map<String, Deque<ReplayEvent>> replayBuffers = new ConcurrentHashMap<>();

    /**
     * 注册 Bot SSE 连接
     *
     * @param appId   应用ID
     * @param emitter SSE 发射器
     * @return 是否成功注册（如果返回 false 表示新连接替换了旧连接）
     */
    public boolean registerBot(String appId, SseEmitter emitter) {
        return registerBot(appId, emitter, DEFAULT_CLIENT_VERSION);
    }

    /**
     * 注册 Bot SSE 连接（带版本）
     *
     * @param appId   应用ID
     * @param emitter SSE 发射器
     * @param version 客户端版本
     * @return 是否成功注册（如果返回 false 表示新连接替换了旧连接）
     */
    public boolean registerBot(String appId, SseEmitter emitter, String version) {
        String normalizedVersion = version != null ? version : DEFAULT_CLIENT_VERSION;
        BotSession newSession = new BotSession(emitter, normalizedVersion, System.currentTimeMillis());
        BotSession existingSession = botSessions.put(appId, newSession);
        boolean replaced = existingSession != null;

        if (replaced) {
            log.warn("Replacing existing Bot SSE connection: appId={}", appId);
            existingSession.emitter.complete();
        }

        emitter.onCompletion(() -> {
            log.info("Bot SSE connection completed: appId={}", appId);
            botSessions.remove(appId, newSession);
        });

        emitter.onTimeout(() -> {
            log.warn("Bot SSE connection timeout: appId={}", appId);
            botSessions.remove(appId, newSession);
        });

        emitter.onError((e) -> {
            log.error("Bot SSE connection error: appId={}, error={}", appId, e.getMessage());
            botSessions.remove(appId, newSession);
        });

        log.info("Bot SSE session registered: appId={}, version={}", appId, normalizedVersion);
        return !replaced;
    }

    public void replayMissedEvents(String appId, SseEmitter emitter, String lastEventId, String version) throws IOException {
        if (!isNewProtocolVersion(version) || lastEventId == null || lastEventId.isBlank()) {
            return;
        }

        Deque<ReplayEvent> buffer = replayBuffers.get(appId);
        if (buffer == null || buffer.isEmpty()) {
            sendReset(emitter, "cursor_expired");
            return;
        }

        boolean found = false;
        for (ReplayEvent event : buffer) {
            if (found) {
                emitter.send(SseEmitter.event()
                        .id(event.eventId)
                        .name(event.eventName)
                        .data(event.payload));
            } else if (event.eventId.equals(lastEventId)) {
                found = true;
            }
        }

        if (!found) {
            sendReset(emitter, "cursor_expired");
        }
    }

    private void sendReset(SseEmitter emitter, String reason) throws IOException {
        emitter.send(SseEmitter.event()
                .name("reset")
                .data(Reset.builder()
                        .type("reset")
                        .reason(reason)
                        .build()));
    }

    /**
     * 注销 Bot SSE 连接
     */
    public void unregisterBot(String appId) {
        BotSession removed = botSessions.remove(appId);
        if (removed != null) {
            removed.emitter.complete();
            log.info("Bot SSE session unregistered: appId={}", appId);
        }
    }

    /**
     * 获取 Bot SSE 连接
     */
    public Optional<SseEmitter> getBotEmitter(String appId) {
        return Optional.ofNullable(botSessions.get(appId)).map(session -> session.emitter);
    }

    /**
     * 检查 Bot 是否在线
     */
    public boolean isOnline(String appId) {
        return botSessions.containsKey(appId);
    }

    /**
     * 获取 Bot 在线数量
     */
    public int getBotOnlineCount() {
        return botSessions.size();
    }

    /**
     * 检查客户端版本是否支持新协议格式 (>= v1.2.0)
     */
    private boolean isNewProtocol(String appId) {
        BotSession session = botSessions.get(appId);
        return session != null && isNewProtocolVersion(session.clientVersion);
    }

    private boolean isNewProtocolVersion(String version) {
        if (version == null) {
            return false;
        }
        return isVersionGreaterOrEqual(version, MIN_VERSION_FOR_NEW_PROTOCOL);
    }

    /**
     * 比较版本号，判断 currentVersion >= minVersion
     */
    private boolean isVersionGreaterOrEqual(String currentVersion, String minVersion) {
        try {
            String current = currentVersion.replaceFirst("^v", "");
            String min = minVersion.replaceFirst("^v", "");

            String[] currentParts = current.split("\\.");
            String[] minParts = min.split("\\.");

            int maxLen = Math.max(currentParts.length, minParts.length);

            for (int i = 0; i < maxLen; i++) {
                int currentPart = i < currentParts.length ? parseIntSafe(currentParts[i]) : 0;
                int minPart = i < minParts.length ? parseIntSafe(minParts[i]) : 0;

                if (currentPart > minPart) {
                    return true;
                } else if (currentPart < minPart) {
                    return false;
                }
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private int parseIntSafe(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9].*", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * 获取所有在线 Bot 的 appId 列表
     */
    public List<String> getBotAppIds() {
        return new ArrayList<>(botSessions.keySet());
    }

    /**
     * 向 Bot 发送企信格式消息
     *
     * 消息数据结构：
     * {
     *   "type": "message",
     *   "version": "1.0",      // v1.2+ 插件使用，用于标识协议版本
     *   "data": {
     *     "message_id": "...", // v1.2+ 使用企信真实ID，v1.0 使用内部生成
     *     "chat_id": "...",
     *     "chat_type": "...",
     *     "from": {"id": "...", "name": "..."},
     *     "text": "...",      // v1.0 使用
     *     "date": ...,        // v1.0 使用
     *     "message": {...},   // v1.2+ 使用，消息对象（支持多媒体扩展）
     *     "timestamp": ...,   // v1.2+ 使用
     *     // v1.2+ 平铺的企信字段
     *     "env": ...,
     *     "ea": "...",
     *     "session_id": "...",
     *     "parent_session_id": "...",
     *     "bot_full_id": "...",   // 企信侧 Bot 完整 ID
     *     "message_type": "...",
     *     "reply_message_id": "..."
     *   }
     * }
     */
    public void sendQixinMessageToBot(String appId, String chatId, String text,
                                       String userId, String userName, String chatType, FromQixinMessage qixinMessage) {
        getBotEmitter(appId).ifPresent(emitter -> {
            try {
                boolean useNewProtocol = isNewProtocol(appId);
                Long qixinMessageId = qixinMessage.getMessageId();
                long timestamp = qixinMessage.getMessageTimestamp() != null
                        ? qixinMessage.getMessageTimestamp() / 1000
                        : System.currentTimeMillis() / 1000;

                ToBotMessage data = ToBotMessage.builder()
                        .messageId(String.valueOf(qixinMessageId))
                        .chatId(chatId)
                        .chatType(normalizeChatType(chatType))
                        .from(SenderInfo.builder()
                                .id(userId)
                                .name(userName)
                                .build())
                        .text(text)
                        .date(timestamp)
                        .build();

                // v1.2+ 字段
                if (useNewProtocol) {
                    data.setMessage(TextMessage.builder()
                            .type("text")
                            .content(text)
                            .build());
                    data.setTimestamp(timestamp);

                    // 平铺企信字段
                    data.setEnv(qixinMessage.getEnv());
                    data.setEa(qixinMessage.getEa());
                    data.setSessionId(qixinMessage.getSessionId());
                    data.setParentSessionId(qixinMessage.getParentSessionId());
                    data.setBotFullId(qixinMessage.getBotFullId());
                    data.setMessageType(qixinMessage.getMessageType());
                    data.setReplyMessageId(qixinMessage.getReplyMessageId());
                }

                // 构建根对象，v1.2+ 添加 version 字段
                SseMessage sseMessage;
                if (useNewProtocol) {
                    sseMessage = SseMessage.of("message", "1.0", data);
                } else {
                    sseMessage = SseMessage.of("message", data);
                }

                SseEmitter.SseEventBuilder builder = SseEmitter.event()
                        .name("message")
                        .data(sseMessage);
                if (qixinMessageId != null) {
                    String eventId = String.valueOf(qixinMessageId);
                    builder.id(eventId);
                    if (useNewProtocol) {
                        appendReplayEvent(appId, eventId, "message", sseMessage);
                    }
                }

                emitter.send(builder);

                log.debug("Qixin message sent to Bot via SSE: appId={}, chatId={}, newProtocol={}",
                        appId, chatId, useNewProtocol);
            } catch (IOException e) {
                log.error("Failed to send Qixin message to Bot via SSE: appId={}, error={}", appId, e.getMessage());
                unregisterBot(appId);
            }
        });
    }

    /**
     * 发送心跳 ping（定时任务调用）
     */
    @Scheduled(fixedRate = 30000) // 每 30 秒
    public void sendHeartbeat() {
        List<String> appIds = new ArrayList<>(botSessions.keySet());
        for (String appId : appIds) {
            BotSession session = botSessions.get(appId);
            if (session == null) {
                continue; // 连接已被移除，跳过
            }
            try {
                session.emitter.send(SseEmitter.event().comment("keepalive"));
            } catch (IOException e) {
                log.debug("Heartbeat failed (connection closed): appId={}, error={}", appId, e.getMessage());
                unregisterBot(appId);
            } catch (Exception e) {
                log.warn("Failed to send heartbeat to appId={}, error={}", appId, e.getMessage());
                unregisterBot(appId);
            }
        }
    }

    @Scheduled(fixedRate = 30000)
    public void disconnectExpiredSessions() {
        if (sseMaxLifetime <= 0) {
            return;
        }

        long now = System.currentTimeMillis();
        for (Map.Entry<String, BotSession> entry : new ArrayList<>(botSessions.entrySet())) {
            String appId = entry.getKey();
            BotSession session = entry.getValue();
            if (session == null) {
                continue;
            }
            if (now - session.connectedAt < sseMaxLifetime) {
                continue;
            }

            log.info("Closing expired Bot SSE connection: appId={}, connectedAt={}, maxLifetime={}ms",
                    appId, session.connectedAt, sseMaxLifetime);
            botSessions.remove(appId, session);
            session.emitter.complete();
        }
    }

    private void appendReplayEvent(String appId, String eventId, String eventName, Object payload) {
        Deque<ReplayEvent> buffer = replayBuffers.computeIfAbsent(appId, key -> new LinkedList<>());
        synchronized (buffer) {
            if (!buffer.isEmpty() && buffer.getLast().eventId.equals(eventId)) {
                return;
            }
            buffer.addLast(new ReplayEvent(eventId, eventName, payload));
            while (buffer.size() > replayLimit) {
                buffer.removeFirst();
            }
        }
    }

    private String normalizeChatType(String chatType) {
        if (chatType == null) {
            return "direct";
        }
        String normalized = chatType.trim().toLowerCase();
        if (normalized.isEmpty()) {
            return "direct";
        }
        return ("group".equals(normalized) || "channel".equals(normalized)) ? "group" : "direct";
    }

    private record BotSession(SseEmitter emitter, String clientVersion, long connectedAt) {
    }

    private record ReplayEvent(String eventId, String eventName, Object payload) {
    }
}
