import { rm, mkdir, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

const requiredFiles = [
  "dist/sharecrm.js",
  "package.json",
  "openclaw.plugin.json",
  "README.md",
];

async function removeDirWithRetry(targetDir) {
  const attempts = 20;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await rm(targetDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (i === attempts || (error?.code !== "EPERM" && error?.code !== "EACCES")) {
        throw error;
      }
      await delay(250 * i);
    }
  }
}

async function removeFileWithRetry(targetFile) {
  const attempts = 4;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await rm(targetFile, { force: true });
      return;
    } catch (error) {
      if (i === attempts || (error?.code !== "EPERM" && error?.code !== "EACCES")) {
        throw error;
      }
      await delay(200 * i);
    }
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectDir,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function commandExists(command, args) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: false,
  });
  if (result.error) {
    return false;
  }
  return result.status === 0;
}

async function main() {
  const stageDir = path.join(projectDir, "dist-package");
  const packageJson = JSON.parse(
    await readFile(path.join(projectDir, "package.json"), "utf8"),
  );
  const zipName = `openclaw-sharecrm-v${packageJson.version}.zip`;
  const zipPath = path.join(projectDir, zipName);

  await removeDirWithRetry(stageDir);
  await mkdir(stageDir, { recursive: true });
  await removeFileWithRetry(zipPath);

  for (const relativeFile of requiredFiles) {
    const src = path.join(projectDir, relativeFile);
    const dest = path.join(stageDir, path.basename(relativeFile));
    await copyFile(src, dest);
  }

  if (process.platform === "win32") {
    run("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path * -DestinationPath '..\\${zipName}' -Force`,
    ], { cwd: stageDir });
  } else if (commandExists("zip", ["-v"])) {
    run("zip", ["-q", "-r", `../${zipName}`, "."], { cwd: stageDir });
  } else if (commandExists("pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"])) {
    run("pwsh", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path * -DestinationPath '../${zipName}' -Force`,
    ], { cwd: stageDir });
  } else {
    throw new Error("No zip tool found. Install zip or PowerShell (pwsh).");
  }

  await removeDirWithRetry(stageDir);
  console.log(`Created ${zipName}`);
}

main().catch((error) => {
  if (error?.code === "EPERM" || error?.code === "EACCES") {
    console.error(`Package build failed: file is locked. Close ${error.path ?? "the target file"} and retry.`);
    process.exitCode = 1;
    return;
  }
  console.error(`Package build failed: ${error.message}`);
  process.exitCode = 1;
});
