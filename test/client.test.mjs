import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSseUrl,
  buildSendMessagePayload,
  SHARECRM_GATEWAY_PROTOCOL_VERSION,
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
