import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("README recommends installing release zip via openclaw plugins install", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /openclaw plugins install \.\/openclaw-sharecrm-v<version>\.zip/);
  assert.doesNotMatch(readme, /unzip sharecrm\.zip/);
  assert.doesNotMatch(readme, /Expand-Archive/);
  assert.match(readme, /顶层目录是 `sharecrm\/`/);
});
