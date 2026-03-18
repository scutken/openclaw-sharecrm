import test from "node:test";
import assert from "node:assert/strict";

import { stripLeadingMention } from "../dist/src/monitor.js";

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
