import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("release workflow reuses build:package for zip artifacts", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

  assert.match(workflow, /run:\s+npm run build:package/);
  assert.doesNotMatch(workflow, /cp dist\/sharecrm\.js package\//);
  assert.doesNotMatch(workflow, /zip -r/);
});
