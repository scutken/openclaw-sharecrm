import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("README recommends installing release zip via openclaw plugins install", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /openclaw plugins install \.\/openclaw-sharecrm-v<version>\.zip --force --accept-capabilities/);
  assert.match(readme, /api\.github\.com\/repos\/scutken\/openclaw-sharecrm\/releases\/latest/);
  assert.match(readme, /npmmirror\.com/);
  assert.doesNotMatch(readme, /unzip sharecrm\.zip/);
  assert.doesNotMatch(readme, /Expand-Archive/);
  assert.match(readme, /顶层目录是 `sharecrm\/`/);
  assert.match(readme, /dmPolicy": "pairing"/);
  assert.match(readme, /不要.*npm config set registry|不要改全局 npm 源/);
  assert.doesNotMatch(readme, /```(?:bash|sh)?\r?\n(?:(?!```)[\s\S])*npm config set registry/);
  assert.match(readme, /version=1\.4\.0/);
  assert.doesNotMatch(readme, /建连时带 `version=1\.3\.0`/);
  assert.match(readme, /当前插件版本：`1\.7\.0`/);
});
