import test from "node:test";
import assert from "node:assert/strict";

import { setShareCrmAccount } from "../dist/src/onboarding.js";

test("setShareCrmAccount merges instead of dropping existing group settings", () => {
  const next = setShareCrmAccount(
    {
      channels: {
        sharecrm: {
          enabled: true,
          appId: "old-app",
          appSecret: "old-secret",
          dmPolicy: "pairing",
          groupPolicy: "open",
          groupAllowFrom: ["chat-1"],
          requireMention: true,
          accounts: {
            sales: { appId: "sales-app", appSecret: "sales-secret" },
          },
        },
      },
    },
    { appId: "new-app", enabled: true },
  );

  assert.equal(next.channels.sharecrm.appId, "new-app");
  assert.equal(next.channels.sharecrm.appSecret, "old-secret");
  assert.equal(next.channels.sharecrm.groupPolicy, "open");
  assert.deepEqual(next.channels.sharecrm.groupAllowFrom, ["chat-1"]);
  assert.equal(next.channels.sharecrm.requireMention, true);
  assert.equal(next.channels.sharecrm.accounts.sales.appId, "sales-app");
});
