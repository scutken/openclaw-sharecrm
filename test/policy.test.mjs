import test from "node:test";
import assert from "node:assert/strict";

import {
  collectDmPolicyWarnings,
  isDirectMessageAuthorized,
  isSelfBotMessage,
} from "../dist/src/policy.js";

test("open policy without wildcard is not public", () => {
  assert.equal(
    isDirectMessageAuthorized({ dmPolicy: "open", senderId: "7618", allowFrom: [] }),
    false,
  );
  assert.equal(
    isDirectMessageAuthorized({ dmPolicy: "open", senderId: "7618", allowFrom: ["*"] }),
    true,
  );
});

test("allowlist and pairing match stable user ids only", () => {
  assert.equal(
    isDirectMessageAuthorized({ dmPolicy: "allowlist", senderId: "7618", allowFrom: ["7618"] }),
    true,
  );
  assert.equal(
    isDirectMessageAuthorized({ dmPolicy: "allowlist", senderId: "7618", allowFrom: ["user:7618"] }),
    true,
  );
  assert.equal(
    isDirectMessageAuthorized({ dmPolicy: "allowlist", senderId: "7618", allowFrom: ["Alice"] }),
    false,
  );
  assert.equal(
    isDirectMessageAuthorized({ dmPolicy: "pairing", senderId: "7618", allowFrom: [] }),
    false,
  );
});

test("collectDmPolicyWarnings explains incomplete open policy", () => {
  const warnings = collectDmPolicyWarnings({
    accountId: "default",
    dmPolicy: "open",
    allowFrom: [],
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /without allowFrom=\["\*"\]/);
});

test("isSelfBotMessage matches bot full id and short id", () => {
  assert.equal(isSelfBotMessage({ senderId: "B.fs.bot_demo", botFullId: "B.fs.bot_demo" }), true);
  assert.equal(isSelfBotMessage({ senderId: "bot_demo", botFullId: "B.fs.bot_demo" }), true);
  assert.equal(isSelfBotMessage({ senderId: "7618", botFullId: "B.fs.bot_demo" }), false);
});
