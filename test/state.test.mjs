import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

import {
  loadDirectChatBindings,
  loadLastEventId,
  persistDirectChatBindings,
  persistLastEventId,
  resolveDirectChatBindingsPath,
} from "../dist/src/state.js";
import { setShareCrmRuntime } from "../dist/src/runtime.js";

async function withTempStateDir(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sharecrm-state-"));
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

test("persistDirectChatBindings writes and loads account bindings", async () => {
  await withTempStateDir(async (tempDir) => {
    const bindings = new Map([
      ["7618", "0:fs:session-1:"],
      ["8855", "0:fs:session-2:parent"],
    ]);

    await persistDirectChatBindings("sales", bindings);

    const loaded = await loadDirectChatBindings("sales");
    assert.deepEqual(Object.fromEntries(loaded), Object.fromEntries(bindings));
    assert.equal(
      resolveDirectChatBindingsPath("sales"),
      path.join(tempDir, "sharecrm", "user-chat-bindings-sales.json"),
    );
  });
});

test("loadDirectChatBindings returns empty map for missing file", async () => {
  await withTempStateDir(async () => {
    const loaded = await loadDirectChatBindings("missing");
    assert.equal(loaded.size, 0);
  });
});

test("persistLastEventId writes and loads the SSE cursor", async () => {
  await withTempStateDir(async () => {
    await persistLastEventId("default", "evt-42");
    assert.equal(await loadLastEventId("default"), "evt-42");

    await persistLastEventId("default", null);
    assert.equal(await loadLastEventId("default"), null);
  });
});
