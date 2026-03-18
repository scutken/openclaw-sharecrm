import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSseUrl,
  buildSendMessagePayload,
  computeRetryDelayMs,
  SHARECRM_GATEWAY_PROTOCOL_VERSION,
  ShareCrmClient,
} from "../dist/src/client.js";

test("buildSseUrl appends token and gateway protocol version", () => {
  const url = buildSseUrl("https://open.fxiaoke.com", "token-123");

  assert.equal(url.origin, "https://open.fxiaoke.com");
  assert.equal(url.pathname, "/im-gateway/bot/events");
  assert.equal(url.searchParams.get("token"), "token-123");
  assert.equal(url.searchParams.get("version"), SHARECRM_GATEWAY_PROTOCOL_VERSION);
});

test("buildSseUrl preserves custom base path", () => {
  const url = buildSseUrl("https://example.com/custom/base", "token-456", "1.2.1");

  assert.equal(url.toString(), "https://example.com/custom/base/im-gateway/bot/events?token=token-456&version=1.2.1");
});

test("buildSendMessagePayload includes reply_message_id when provided", () => {
  assert.deepEqual(buildSendMessagePayload("chat-1", "hello", { replyMessageId: 123 }), {
    chat_id: "chat-1",
    text: "hello",
    reply_message_id: 123,
  });
});

test("buildSendMessagePayload omits reply_message_id when empty", () => {
  assert.deepEqual(buildSendMessagePayload("chat-1", "hello", { replyMessageId: "" }), {
    chat_id: "chat-1",
    text: "hello",
  });
});

test("computeRetryDelayMs adds up to 20% jitter", () => {
  assert.equal(computeRetryDelayMs(1000, () => 0), 1000);
  assert.equal(computeRetryDelayMs(1000, () => 1), 1200);
});

test("sendMessage refreshes token and retries once on 40101", async () => {
  const calls = [];
  const client = new ShareCrmClient({
    account: {
      accountId: "default",
      enabled: true,
      configured: true,
      gatewayBaseUrl: "https://open.fxiaoke.com",
      appId: "app-1",
      appSecret: "secret-1",
      config: {},
    },
    onConnected() {},
    onMessage() {},
    onDisconnected() {},
    log() {},
    sleep: async () => {},
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/auth/token")) {
        return {
          json: async () => ({ code: 0, data: { accessToken: `token-${calls.length}`, expiresIn: 7200, tokenType: "Bearer" } }),
        };
      }

      const authHeader = init?.headers?.Authorization ?? init?.headers?.authorization;
      if (authHeader === "Bearer token-1") {
        return { json: async () => ({ code: 40101, msg: "Token expired" }) };
      }
      return { json: async () => ({ code: 0, data: { message_id: "msg-1" } }) };
    },
  });

  const result = await client.sendMessage("chat-1", "hello");

  assert.deepEqual(result, { messageId: "msg-1", chatId: "chat-1" });
  assert.equal(calls.filter((item) => item.url.includes("/auth/token")).length, 2);
  assert.equal(calls.filter((item) => item.url.includes("/qixin/message/send")).length, 2);
});

test("sendMessage retries once on transient send exception", async () => {
  let sendAttempts = 0;
  const client = new ShareCrmClient({
    account: {
      accountId: "default",
      enabled: true,
      configured: true,
      gatewayBaseUrl: "https://open.fxiaoke.com",
      appId: "app-1",
      appSecret: "secret-1",
      config: {},
    },
    onConnected() {},
    onMessage() {},
    onDisconnected() {},
    log() {},
    sleep: async () => {},
    fetchImpl: async (url) => {
      if (String(url).includes("/auth/token")) {
        return {
          json: async () => ({ code: 0, data: { accessToken: "token-1", expiresIn: 7200, tokenType: "Bearer" } }),
        };
      }
      sendAttempts += 1;
      if (sendAttempts === 1) {
        throw new Error("network down");
      }
      return { json: async () => ({ code: 0, data: { message_id: "msg-2" } }) };
    },
  });

  const result = await client.sendMessage("chat-2", "hello");

  assert.deepEqual(result, { messageId: "msg-2", chatId: "chat-2" });
  assert.equal(sendAttempts, 2);
});

test("sendMessage waits for reconnect and retries once on 50001", async () => {
  let sendAttempts = 0;
  let sleepCalls = 0;
  const client = new ShareCrmClient({
    account: {
      accountId: "default",
      enabled: true,
      configured: true,
      gatewayBaseUrl: "https://open.fxiaoke.com",
      appId: "app-1",
      appSecret: "secret-1",
      config: {},
    },
    onConnected() {},
    onMessage() {},
    onDisconnected() {},
    log() {},
    sleep: async () => {
      sleepCalls += 1;
      client._connected = true;
    },
    fetchImpl: async (url) => {
      if (String(url).includes("/auth/token")) {
        return {
          json: async () => ({ code: 0, data: { accessToken: "token-1", expiresIn: 7200, tokenType: "Bearer" } }),
        };
      }
      sendAttempts += 1;
      if (sendAttempts === 1) {
        return { json: async () => ({ code: 50001, msg: "Bot not connected" }) };
      }
      return { json: async () => ({ code: 0, data: { message_id: "msg-3" } }) };
    },
  });

  client._connected = false;
  const result = await client.sendMessage("chat-3", "hello");

  assert.deepEqual(result, { messageId: "msg-3", chatId: "chat-3" });
  assert.equal(sendAttempts, 2);
  assert.ok(sleepCalls >= 1);
});
