import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readZipEntries(zipPath) {
  for (const pythonCommand of ["python", "python3"]) {
    try {
      const { stdout } = await execFileAsync(pythonCommand, [
        "-c",
        [
          "import sys, zipfile",
          "with zipfile.ZipFile(sys.argv[1]) as zf:",
          "    print('\\n'.join(sorted(zf.namelist())))",
        ].join("\n"),
        zipPath,
      ], { cwd: projectDir });
      return stdout.trim().split("\n");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error("python or python3 is required to inspect the zip artifact");
}

test("build-package creates a zip with a sharecrm top-level directory", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(projectDir, "package.json"), "utf8"),
  );
  const zipPath = path.join(projectDir, `openclaw-sharecrm-v${packageJson.version}.zip`);

  await execFileAsync("npm", ["run", "build"], { cwd: projectDir });

  try {
    await execFileAsync("node", ["./scripts/build-package.mjs"], { cwd: projectDir });
    assert.deepEqual(await readZipEntries(zipPath), [
      "sharecrm/README.md",
      "sharecrm/dist/setup-entry.js",
      "sharecrm/dist/sharecrm.js",
      "sharecrm/openclaw.plugin.json",
      "sharecrm/package.json",
    ]);
  } finally {
    await rm(zipPath, { force: true });
  }
});
