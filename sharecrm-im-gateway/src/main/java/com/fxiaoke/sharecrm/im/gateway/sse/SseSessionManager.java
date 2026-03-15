package com.fxiaoke.sharecrm.im.gateway.sse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fxiaoke.sharecrm.im.gateway.qixin.QixinMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
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
@RequiredArgsConstructor
public class SseSessionManager {

    private final ObjectMapper objectMapper;

    /**
     * Bot SSE 会话 (appId -> SseEmitter)
     */
    private final Map<String, SseEmitter> botEmitters = new ConcurrentHashMap<>();

    /**
     * Bot 客户端版本 (appId -> version)
     * 用于决定消息格式
     */
    private final Map<String, String> botVersions = new ConcurrentHashMap<>();

    /**
     * 最低支持新协议格式的版本（v1.2.0）
     */
    private static final String MIN_VERSION_FOR_NEW_PROTOCOL = "1.2.0";

    /**
     * 注册 Bot SSE 连接
     *
     * @param appId   应用ID
     * @param emitter SSE 发射器
     * @return 是否成功注册（如果返回 false 表示新连接替换了旧连接）
     */
    public boolean registerBot(String appId, SseEmitter emitter) {
        return registerBot(appId, emitter, "v1.0.0");
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
        SseEmitter existing = botEmitters.put(appId, emitter);
        boolean replaced = existing != null;

        // 存储客户端版本
        String normalizedVersion = version != null ? version : "v1.0.0";
        botVersions.put(appId, normalizedVersion);

        if (replaced) {
            log.warn("Replacing existing Bot SSE connection: appId={}", appId);
            existing.complete(); // 断开旧连接
        }

        // 连接关闭时清理
        emitter.onCompletion(() -> {
            log.info("Bot SSE connection completed: appId={}", appId);
            botEmitters.remove(appId, emitter);
            botVersions.remove(appId);
        });

        emitter.onTimeout(() -> {
            log.warn("Bot SSE connection timeout: appId={}", appId);
            botEmitters.remove(appId, emitter);
            botVersions.remove(appId);
        });

        emitter.onError((e) -> {
            log.error("Bot SSE connection error: appId={}, error={}", appId, e.getMessage());
            botEmitters.remove(appId, emitter);
            botVersions.remove(appId);
        });

        log.info("Bot SSE session registered: appId={}, version={}", appId, normalizedVersion);
        return !replaced;
    }

    /**
     * 注销 Bot SSE 连接
     */
    public void unregisterBot(String appId) {
        SseEmitter removed = botEmitters.remove(appId);
        if (removed != null) {
            log.info("Bot SSE session unregistered: appId={}", appId);
        }
    }

    /**
     * 获取 Bot SSE 连接
     */
    public Optional<SseEmitter> getBotEmitter(String appId) {
        return Optional.ofNullable(botEmitters.get(appId));
    }

    /**
     * 检查 Bot 是否在线
     */
    public boolean isOnline(String appId) {
        return botEmitters.containsKey(appId);
    }

    /**
     * 获取 Bot 在线数量
     */
    public int getBotOnlineCount() {
        return botEmitters.size();
    }

    /**
     * 检查客户端版本是否支持新协议格式 (>= v1.2.0)
     */
    private boolean isNewProtocol(String appId) {
        String version = botVersions.get(appId);
        if (version == null) {
            return false; // 默认旧协议
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
        return new ArrayList<>(botEmitters.keySet());
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
     *     "bot_full_id": "...",
     *     "message_type": "...",
     *     "reply_message_id": "..."
     *   }
     * }
     */
    public void sendQixinMessageToBot(String appId, String chatId, String messageId, String text,
                                       String userId, String userName, String chatType, QixinMessage.InboundMessage qixinMessage) {
        getBotEmitter(appId).ifPresent(emitter -> {
            try {
                boolean useNewProtocol = isNewProtocol(appId);
                Long qixinMessageId = qixinMessage.getMessageId();
                long timestamp = qixinMessage.getMessageTimestamp() != null
                        ? qixinMessage.getMessageTimestamp() / 1000
                        : System.currentTimeMillis() / 1000;

                // 构建消息数据
                Map<String, Object> data = new LinkedHashMap<>();

                // message_id: v1.2+ 使用企信真实ID，v1.0 使用内部生成
                data.put("message_id", (useNewProtocol && qixinMessageId != null)
                        ? String.valueOf(qixinMessageId) : messageId);

                data.put("chat_id", chatId);
                data.put("chat_type", normalizeChatType(chatType));
                data.put("from", Map.of("id", userId, "name", userName));

                // v1.0 字段
                data.put("text", text);
                data.put("date", timestamp);

                // v1.2+ 字段
                if (useNewProtocol) {
                    Map<String, Object> message = new LinkedHashMap<>();
                    message.put("type", "text");
                    message.put("content", text);
                    data.put("message", message);
                    data.put("timestamp", timestamp);

                    // 平铺企信字段
                    data.put("env", qixinMessage.getEnv());
                    data.put("ea", qixinMessage.getEa());
                    data.put("session_id", qixinMessage.getSessionId());
                    data.put("parent_session_id", qixinMessage.getParentSessionId());
                    data.put("bot_full_id", qixinMessage.getBotFullId());
                    data.put("message_type", qixinMessage.getMessageType());
                    if (qixinMessage.getReplyMessageId() != null) {
                        data.put("reply_message_id", qixinMessage.getReplyMessageId());
                    }
                }

                // 构建根对象，v1.2+ 添加 version 字段
                Map<String, Object> root;
                if (useNewProtocol) {
                    root = Map.of(
                            "type", "message",
                            "version", "1.0",
                            "data", data
                    );
                } else {
                    root = Map.of(
                            "type", "message",
                            "data", data
                    );
                }

                String json = objectMapper.writeValueAsString(root);

                emitter.send(SseEmitter.event()
                        .name("message")
                        .data(json));

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
        long now = System.currentTimeMillis();
        // 复制一份 key 列表，避免并发修改问题
        List<String> appIds = new ArrayList<>(botEmitters.keySet());
        for (String appId : appIds) {
            SseEmitter emitter = botEmitters.get(appId);
            if (emitter == null) {
                continue; // 连接已被移除，跳过
            }
            try {
                emitter.send(SseEmitter.event()
                        .name("ping")
                        .data(Map.of(
                                "type", "ping",
                                "time", now / 1000
                        )));
            } catch (IOException e) {
                // 忽略 Broken pipe 等连接断开异常，避免打印 ERROR 日志
                // 这类异常说明客户端已断开，onError 回调会处理清理
                log.debug("Heartbeat failed (connection closed): appId={}, error={}", appId, e.getMessage());
                unregisterBot(appId);
            } catch (Exception e) {
                log.warn("Failed to send heartbeat to appId={}, error={}", appId, e.getMessage());
                unregisterBot(appId);
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
}
