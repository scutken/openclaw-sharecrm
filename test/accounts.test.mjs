import test from "node:test";
import assert from "node:assert/strict";

import { resolveAccount } from "../dist/src/accounts.js";

test("resolveAccount merges account overrides into effective config", () => {
  const account = resolveAccount({
    channels: {
      sharecrm: {
        enabled: true,
        gatewayBaseUrl: "https://open.fxiaoke.com",
        appId: "base-app",
        appSecret: "base-secret",
        dmPolicy: "pairing",
        allowFrom: ["u-1"],
        groupPolicy: "disabled",
        historyLimit: 8,
        textChunkLimit: 4000,
        accounts: {
          sales: {
            enabled: true,
            appId: "sales-app",
            appSecret: "sales-secret",
            dmPolicy: "allowlist",
            allowFrom: ["u-2"],
            groupPolicy: "open",
            groupAllowFrom: ["chat-1"],
            historyLimit: 16,
            textChunkLimit: 2000,
          },
        },
      },
    },
  }, "sales");

  assert.equal(account.appId, "sales-app");
  assert.equal(account.appSecret, "sales-secret");
  assert.equal(account.config.dmPolicy, "allowlist");
  assert.deepEqual(account.config.allowFrom, ["u-2"]);
  assert.equal(account.config.groupPolicy, "open");
  assert.deepEqual(account.config.groupAllowFrom, ["chat-1"]);
  assert.equal(account.config.historyLimit, 16);
  assert.equal(account.config.textChunkLimit, 2000);
  assert.ok(account.config.accounts);
});

test("resolveAccount keeps channel defaults when account override is absent", () => {
  const account = resolveAccount({
    channels: {
      sharecrm: {
        enabled: true,
        gatewayBaseUrl: "https://open.fxiaoke.com",
        appId: "base-app",
        appSecret: "base-secret",
        dmPolicy: "open",
        groupPolicy: "allowlist",
        groupAllowFrom: ["chat-2"],
      },
    },
  });

  assert.equal(account.accountId, "default");
  assert.equal(account.config.dmPolicy, "open");
  assert.equal(account.config.groupPolicy, "allowlist");
  assert.deepEqual(account.config.groupAllowFrom, ["chat-2"]);
});
