import test from "node:test";
import assert from "node:assert/strict";

import { redactLogArgs, redactSensitive, redactUrl } from "../dist/src/log.js";

test("redactUrl hides query token", () => {
  assert.equal(
    redactUrl("https://open.fxiaoke.com/im-gateway/bot/events?token=secret-token&version=1.3.0"),
    "https://open.fxiaoke.com/im-gateway/bot/events?token=***&version=1.3.0",
  );
});

test("redactSensitive hides appSecret and tokens", () => {
  assert.deepEqual(
    redactSensitive({
      appId: "bot-001",
      appSecret: "super-secret",
      data: { accessToken: "token-123" },
    }),
    {
      appId: "bot-001",
      appSecret: "***",
      data: { accessToken: "***" },
    },
  );
});

test("redactLogArgs redacts nested request snapshots", () => {
  const [message, payload] = redactLogArgs([
    "sharecrm: fetchToken OK (fetch)",
    {
      params: {
        url: "https://open.fxiaoke.com/im-gateway/auth/token",
        body: { appId: "bot-001", appSecret: "super-secret" },
      },
    },
  ]);

  assert.equal(message, "sharecrm: fetchToken OK (fetch)");
  assert.equal(payload.params.body.appSecret, "***");
});
