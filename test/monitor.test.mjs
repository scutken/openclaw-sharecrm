import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeGatewayHistoryEntries,
  stripLeadingMention,
} from "../dist/src/monitor.js";

test("stripLeadingMention removes bot full id mention", () => {
  assert.deepEqual(stripLeadingMention("@B.fs.bot_demo 你好", "B.fs.bot_demo"), {
    text: "你好",
    matched: true,
  });
});

test("stripLeadingMention removes short bot id mention", () => {
  assert.deepEqual(stripLeadingMention("bot_demo: 帮我查一下", "B.fs.bot_demo"), {
    text: "帮我查一下",
    matched: true,
  });
});

test("stripLeadingMention keeps text when no mention matched", () => {
  assert.deepEqual(stripLeadingMention("大家好", "B.fs.bot_demo"), {
    text: "大家好",
    matched: false,
  });
});

test("normalizeGatewayHistoryEntries sorts entries and excludes current message", () => {
  const entries = normalizeGatewayHistoryEntries({
    currentMessageId: "102",
    historyMessages: [
      {
        message_id: "102",
        sender_id: "7618",
        full_sender_id: "E.fs.7618",
        content: "当前消息",
        message_timestamp: 1710000010000,
      },
      {
        message_id: "100",
        sender_id: "7001",
        full_sender_id: "E.fs.7001",
        content: "第一条",
        message_timestamp: 1710000000000,
      },
      {
        message_id: "101",
        sender_id: "7002",
        full_sender_id: "E.fs.7002",
        message_type: "I",
        content: "图片消息",
        message_timestamp: 1710000005000,
      },
    ],
  });

  assert.deepEqual(entries, [
    {
      sender: "E.fs.7001",
      body: "[message_id: 100]\n第一条",
      timestamp: 1710000000000,
      messageId: "100",
    },
    {
      sender: "E.fs.7002",
      body: "[message_id: 101]\n[message_type: I]\n图片消息",
      timestamp: 1710000005000,
      messageId: "101",
    },
  ]);
});
