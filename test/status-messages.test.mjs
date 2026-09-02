import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ACK_MESSAGES,
  DEFAULT_PROGRESS_MESSAGES,
  GROUP_REJECT_HINTS,
  buildGroupRejectHint,
  extractAtMentionNames,
  formatElapsed,
  isLikelyCommandText,
  pickMessage,
  renderStatusMessage,
  resolveAckSettings,
  resolveProgressSettings,
} from "../dist/src/status-messages.js";

test("formatElapsed uses compact chinese units", () => {
  assert.equal(formatElapsed(20_000), "20秒");
  assert.equal(formatElapsed(65_000), "1分5秒");
  assert.equal(formatElapsed(3_600_000), "1小时");
});

test("default ack pool is a single receipt line", () => {
  assert.deepEqual(DEFAULT_ACK_MESSAGES, ["👀已收到，稍后回您！"]);
});

test("renderStatusMessage replaces elapsed without requiring round", () => {
  const rendered = renderStatusMessage(
    "⏳仍在工作，已处理 {elapsed}",
    { elapsedMs: 180_000 },
  );
  assert.equal(rendered, "⏳仍在工作，已处理 3分");
});

test("progress templates from the default pool all accept elapsed", () => {
  for (const template of DEFAULT_PROGRESS_MESSAGES) {
    const rendered = renderStatusMessage(template, { elapsedMs: 65_000 });
    assert.match(rendered, /1分5秒/);
    assert.doesNotMatch(rendered, /轮/);
  }
});

test("pickMessage stays inside the pool", () => {
  assert.equal(pickMessage(["a", "b", "c"], () => 0), "a");
  assert.equal(pickMessage(["a", "b", "c"], () => 0.99), "c");
});

test("group reject hints tell the user which config to change", () => {
  assert.match(GROUP_REJECT_HINTS.disabled, /Group Policy/);
  assert.match(GROUP_REJECT_HINTS.notAllowlisted, /groupAllowFrom/);
  assert.match(GROUP_REJECT_HINTS.missingMention, /Mention Aliases/);
});

test("extractAtMentionNames keeps @XXX display names", () => {
  assert.deepEqual(extractAtMentionNames("@二哈 收到消息么？"), ["二哈"]);
  assert.deepEqual(extractAtMentionNames("请 @小助手 看一下"), ["小助手"]);
  assert.deepEqual(extractAtMentionNames("大家好"), []);
});

test("missing-mention hint includes unmatched @ names", () => {
  const hint = buildGroupRejectHint("missingMention", ["二哈"]);
  assert.match(hint, /@二哈/);
  assert.match(hint, /Mention Aliases/);
});

test("command-like inbound text is skipped", () => {
  assert.equal(isLikelyCommandText("!!"), true);
  assert.equal(isLikelyCommandText("!userId"), true);
  assert.equal(isLikelyCommandText("/help"), true);
  assert.equal(isLikelyCommandText("/status"), true);
  assert.equal(isLikelyCommandText("帮我看一下合同"), false);
});

test("group defaults enable ack and disable progress", () => {
  const ack = resolveAckSettings({}, true);
  const progress = resolveProgressSettings({}, true);
  assert.equal(ack.enabled, true);
  assert.equal(progress.enabled, false);
});

test("direct defaults enable ack and progress", () => {
  const ack = resolveAckSettings({}, false);
  const progress = resolveProgressSettings({}, false);
  assert.equal(ack.enabled, true);
  assert.equal(progress.enabled, true);
  assert.deepEqual(ack.messages, ["👀已收到，稍后回您！"]);
  assert.deepEqual(progress.messages, ["⏳仍在工作，已处理 {elapsed}"]);
  assert.deepEqual(progress.scheduleMs, [60_000, 180_000, 360_000]);
  assert.equal(progress.repeatMs, 180_000);
  assert.equal(progress.maxTimes, 20);
});

test("legacy delayMs and intervalMs keep the old timing algorithm", () => {
  const progress = resolveProgressSettings({
    progress: { delayMs: 20_000, intervalMs: 45_000, maxTimes: 3 },
  }, false);
  assert.equal(progress.scheduleMs, undefined);
  assert.equal(progress.delayMs, 20_000);
  assert.equal(progress.intervalMs, 45_000);
  assert.equal(progress.maxTimes, 3);
});
