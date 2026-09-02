import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  isLikelyShareCrmChatId,
  isValidShareCrmTarget,
  resolveShareCrmSendTarget,
  shareCrmPlugin,
} from "../dist/src/channel.js";
import { rememberDirectChatId } from "../dist/src/monitor.js";
import { setShareCrmRuntime } from "../dist/src/runtime.js";

async function withTempRuntime(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sharecrm-targets-"));
  setShareCrmRuntime({
    state: {
      resolveStateDir: () => tempDir,
    },
    logging: {
      getChildLogger: () => ({ info() {}, warn() {}, error() {} }),
    },
  });

  try {
    await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("isLikelyShareCrmChatId only accepts ShareCRM chat ids", () => {
  assert.equal(isLikelyShareCrmChatId("0:fs:session-123:"), true);
  assert.equal(isLikelyShareCrmChatId("0:fs:session-123:parent-456"), true);
  assert.equal(isLikelyShareCrmChatId("heartbeat"), false);
  assert.equal(isLikelyShareCrmChatId("chat:0:fs:session-123:"), false);
});

test("targetResolver only accepts explicit ShareCRM targets", () => {
  assert.equal(shareCrmPlugin.messaging.targetResolver.looksLikeId("chat:0:fs:session-123:"), true);
  assert.equal(shareCrmPlugin.messaging.targetResolver.looksLikeId("user:7618"), true);
  assert.equal(shareCrmPlugin.messaging.targetResolver.looksLikeId("0:fs:session-123:"), true);
  assert.equal(shareCrmPlugin.messaging.targetResolver.looksLikeId("heartbeat"), false);
  assert.equal(isValidShareCrmTarget("sharecrm:chat:0:fs:session-123:"), true);
});

test("resolveShareCrmSendTarget rejects invalid raw target", async () => {
  await assert.rejects(
    resolveShareCrmSendTarget({ accountId: "default", to: "heartbeat" }),
    /invalid target "heartbeat"/i,
  );
});

test("resolveShareCrmSendTarget resolves mapped user target", async () => {
  await withTempRuntime(async () => {
    await rememberDirectChatId("default", "7618", "0:fs:session-123:");
    const resolved = await resolveShareCrmSendTarget({ accountId: "default", to: "user:7618" });
    assert.deepEqual(resolved, { chatId: "0:fs:session-123:" });
  });
});

test("resolveShareCrmSendTarget rejects user target without mapping", async () => {
  await assert.rejects(
    resolveShareCrmSendTarget({ accountId: "default", to: "user:unknown-user" }),
    /no known chat_id for user/i,
  );
});
