import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { rewriteShareCrmCronDeliveryFromSession } from "../dist/index.js";

async function withSessionStore(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sharecrm-cron-"));
  const storePath = path.join(tempDir, "sessions.json");
  const logs = { info: [], warn: [] };

  const api = {
    config: { session: { store: storePath } },
    runtime: {
      channel: {
        session: {
          resolveStorePath: () => storePath,
        },
      },
    },
    logger: {
      info(message) {
        logs.info.push(message);
      },
      warn(message) {
        logs.warn.push(message);
      },
    },
  };

  try {
    await fn({ tempDir, storePath, api, logs });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("rewriteShareCrmCronDeliveryFromSession prefers session deliveryContext", async () => {
  await withSessionStore(async ({ storePath, api, logs }) => {
    const sessionKey = "agent:main:sharecrm:direct:e.fs.8017:chat:0:fs:session-123:";
    await writeFile(
      storePath,
      JSON.stringify({
        [sessionKey]: {
          deliveryContext: {
            channel: "sharecrm",
            to: "chat:0:fs:session-123:",
            accountId: "default",
          },
          origin: {
            channel: "sharecrm",
            to: "chat:0:fs:old-session:",
          },
          lastTo: "chat:0:fs:old-session:",
        },
      }),
    );

    const rewritten = await rewriteShareCrmCronDeliveryFromSession({
      api,
      logger: api.logger,
      sessionKey,
      target: { payload: { kind: "agentTurn" } },
    });

    assert.deepEqual(rewritten?.delivery, {
      mode: "announce",
      channel: "sharecrm",
      to: "chat:0:fs:session-123:",
      accountId: "default",
    });
    assert.equal(logs.info.length, 1);
  });
});

test("rewriteShareCrmCronDeliveryFromSession keeps explicit valid target", async () => {
  await withSessionStore(async ({ storePath, api, logs }) => {
    const sessionKey = "agent:main:sharecrm:direct:e.fs.8017:chat:0:fs:session-123:";
    await writeFile(
      storePath,
      JSON.stringify({
        [sessionKey]: {
          deliveryContext: {
            channel: "sharecrm",
            to: "chat:0:fs:session-123:",
          },
        },
      }),
    );

    const explicit = {
      payload: { kind: "agentTurn" },
      delivery: { mode: "announce", channel: "sharecrm", to: "chat:0:fs:explicit:" },
    };

    const rewritten = await rewriteShareCrmCronDeliveryFromSession({
      api,
      logger: api.logger,
      sessionKey,
      target: explicit,
    });

    assert.equal(rewritten, undefined);
    assert.equal(logs.info.length, 0);
    assert.equal(logs.warn.length, 0);
  });
});

test("rewriteShareCrmCronDeliveryFromSession repairs obvious invalid target", async () => {
  await withSessionStore(async ({ storePath, api }) => {
    const sessionKey = "agent:main:sharecrm:direct:e.fs.8017:chat:0:fs:session-123:";
    await writeFile(
      storePath,
      JSON.stringify({
        [sessionKey]: {
          origin: {
            channel: "sharecrm",
            to: "chat:0:fs:session-123:",
            accountId: "default",
          },
        },
      }),
    );

    const rewritten = await rewriteShareCrmCronDeliveryFromSession({
      api,
      logger: api.logger,
      sessionKey,
      target: {
        payload: { kind: "agentTurn" },
        delivery: { mode: "announce", channel: "sharecrm", to: "heartbeat" },
      },
    });

    assert.equal(rewritten?.delivery?.to, "chat:0:fs:session-123:");
  });
});
