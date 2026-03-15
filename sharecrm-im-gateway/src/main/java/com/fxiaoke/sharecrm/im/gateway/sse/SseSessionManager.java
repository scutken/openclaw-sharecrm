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
     * 注册 Bot SSE 连接
     *
     * @param appId   应用ID
     * @param emitter SSE 发射器
     * @return 是否成功注册（如果返回 false 表示新连接替换了旧连接）
     */
    public boolean registerBot(String appId, SseEmitter emitter) {
        SseEmitter existing = botEmitters.put(appId, emitter);
        boolean replaced = existing != null;

        if (replaced) {
            log.warn("Replacing existing Bot SSE connection: appId={}", appId);
            existing.complete(); // 断开旧连接
        }

        // 连接关闭时清理
        emitter.onCompletion(() -> {
            log.info("Bot SSE connection completed: appId={}", appId);
            botEmitters.remove(appId, emitter);
        });

        emitter.onTimeout(() -> {
            log.warn("Bot SSE connection timeout: appId={}", appId);
            botEmitters.remove(appId, emitter);
        });

        emitter.onError((e) -> {
            log.error("Bot SSE connection error: appId={}, error={}", appId, e.getMessage());
            botEmitters.remove(appId, emitter);
        });

        log.info("Bot SSE session registered: appId={}", appId);
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
     * 获取所有在线 Bot 的 appId 列表
     */
    public List<String> getBotAppIds() {
        return new ArrayList<>(botEmitters.keySet());
    }

    /**
     * 向 Bot 发送企信格式消息
     */
    public void sendQixinMessageToBot(String appId, String chatId, String messageId, String text,
                                       String userId, String userName, String chatType, QixinMessage.InboundMessage qixinMessage) {
        getBotEmitter(appId).ifPresent(emitter -> {
            try {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("message_id", messageId);
                data.put("chat_id", chatId);
                data.put("chat_type", normalizeChatType(chatType));
                data.put("from", Map.of(
                        "id", userId,
                        "name", userName
                ));
                data.put("text", text);
                data.put("date", qixinMessage.getMessageTimestamp() != null
                        ? qixinMessage.getMessageTimestamp() / 1000
                        : System.currentTimeMillis() / 1000);

                // 添加企信特有字段
                Map<String, Object> qixinContext = new LinkedHashMap<>();
                qixinContext.put("env", qixinMessage.getEnv());
                qixinContext.put("ea", qixinMessage.getEa());
                qixinContext.put("session_id", qixinMessage.getSessionId());
                qixinContext.put("parent_session_id", qixinMessage.getParentSessionId());
                qixinContext.put("bot_full_id", qixinMessage.getBotFullId());
                qixinContext.put("message_type", qixinMessage.getMessageType());
                qixinContext.put("qixin_message_id", qixinMessage.getMessageId());
                qixinContext.put("reply_message_id", qixinMessage.getReplyMessageId());
                data.put("qixin", qixinContext);

                String json = objectMapper.writeValueAsString(Map.of(
                        "type", "message",
                        "data", data
                ));

                emitter.send(SseEmitter.event()
                        .name("message")
                        .data(json));

                log.debug("Qixin message sent to Bot via SSE: appId={}, chatId={}", appId, chatId);
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
