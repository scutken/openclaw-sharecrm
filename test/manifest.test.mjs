import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest keeps plugin configSchema empty and channel schema under channelConfigs", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(projectDir, "openclaw.plugin.json"), "utf8"),
  );

  assert.equal(manifest.kind, undefined);
  assert.deepEqual(manifest.channels, ["sharecrm"]);
  assert.equal(manifest.activation.onStartup, false);
  assert.deepEqual(manifest.configSchema.properties, {});
  assert.equal(manifest.channelConfigs.sharecrm.schema.required, undefined);
  assert.equal(manifest.channelConfigs.sharecrm.uiHints.appSecret.sensitive, true);
  assert.equal(manifest.channelConfigs.sharecrm.schema.properties.requireMention.default, true);
});

test("package metadata declares peer openclaw and runtime entries", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectDir, "package.json"), "utf8"),
  );

  assert.equal(packageJson.dependencies?.openclaw, undefined);
  assert.equal(packageJson.peerDependencies.openclaw, ">=2026.7.1-2");
  assert.deepEqual(packageJson.openclaw.runtimeExtensions, ["./dist/sharecrm.js"]);
  assert.equal(packageJson.openclaw.runtimeSetupEntry, "./dist/setup-entry.js");
  assert.equal(packageJson.openclaw.compat.minGatewayVersion, "2026.7.1-2");
});
