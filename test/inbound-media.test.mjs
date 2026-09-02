import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isBlockedIp,
  sanitizeFilename,
  stageInboundImages,
} from "../dist/src/inbound-media.js";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d4d0000000049454e44ae426082",
  "hex",
);

test("sanitizeFilename keeps basename and strips path", () => {
  assert.equal(sanitizeFilename("../a/b/c.jpg"), "c.jpg");
  assert.equal(sanitizeFilename(""), "image.png");
});

test("isBlockedIp rejects loopback and private ranges", () => {
  assert.equal(isBlockedIp("127.0.0.1"), true);
  assert.equal(isBlockedIp("10.0.0.1"), true);
  assert.equal(isBlockedIp("192.168.1.8"), true);
  assert.equal(isBlockedIp("169.254.1.1"), true);
  assert.equal(isBlockedIp("8.8.8.8"), false);
});

test("stageInboundImages downloads public https images to media/inbound", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sharecrm-media-"));
  try {
    const result = await stageInboundImages({
      accountId: "default",
      messageId: "m1",
      images: [{ url: "https://img.example/a", filename: "a.png" }],
      deps: {
        stateDir: tempDir,
        lookupImpl: async () => ["8.8.8.8"],
        fetchImpl: async () =>
          new Response(PNG, {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      },
    });

    assert.equal(result.failed, 0);
    assert.equal(result.staged.length, 1);
    assert.match(result.staged[0].path, /media[\\/]+inbound[\\/]+default[\\/]+m1-0-a\.png$/);
    assert.equal(result.markdown, `![a.png](${result.staged[0].path})`);
    const saved = await readFile(result.staged[0].path);
    assert.equal(saved.equals(PNG), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("stageInboundImages skips private hosts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sharecrm-media-"));
  try {
    const result = await stageInboundImages({
      accountId: "default",
      messageId: "m2",
      images: [{ url: "https://internal.example/a", filename: "a.png" }],
      deps: {
        stateDir: tempDir,
        lookupImpl: async () => ["10.0.0.8"],
        fetchImpl: async () => {
          throw new Error("should not fetch");
        },
      },
    });
    assert.equal(result.staged.length, 0);
    assert.equal(result.failed, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
