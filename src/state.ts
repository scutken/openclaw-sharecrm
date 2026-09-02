import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { tryGetShareCrmRuntime } from "./runtime.js";

const CHANNEL_ID = "sharecrm";
const DIRECT_CHAT_BINDINGS_VERSION = 1;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

type DirectChatBindingsFile = {
  version: number;
  bindings: Record<string, string>;
};

const persistQueues = new Map<string, Promise<void>>();

export function normalizeAccountIdForFile(accountId: string): string {
  return (accountId || "default").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function resolveShareCrmStateDir(): string {
  const pluginRuntime = tryGetShareCrmRuntime();
  return pluginRuntime?.state?.resolveStateDir?.() ?? resolveStateDir() ?? path.join(os.homedir(), ".openclaw");
}

export function resolveDirectChatBindingsPath(accountId: string): string {
  return path.join(resolveShareCrmStateDir(), CHANNEL_ID, `user-chat-bindings-${normalizeAccountIdForFile(accountId)}.json`);
}

export async function loadDirectChatBindings(accountId: string): Promise<Map<string, string>> {
  const filePath = resolveDirectChatBindingsPath(accountId);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as DirectChatBindingsFile;

    if (parsed?.version !== DIRECT_CHAT_BINDINGS_VERSION || !parsed.bindings || typeof parsed.bindings !== "object") {
      return new Map();
    }

    return new Map(
      Object.entries(parsed.bindings)
        .map(([userId, chatId]) => [String(userId).trim(), String(chatId).trim()] as const)
        .filter(([userId, chatId]) => Boolean(userId && chatId)),
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
}

async function writeDirectChatBindings(accountId: string, bindings: Map<string, string>): Promise<void> {
  const filePath = resolveDirectChatBindingsPath(accountId);
  const dirPath = path.dirname(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const payload: DirectChatBindingsFile = {
    version: DIRECT_CHAT_BINDINGS_VERSION,
    bindings: Object.fromEntries(bindings.entries()),
  };

  await mkdir(dirPath, { recursive: true, mode: DIR_MODE });

  try {
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: FILE_MODE });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function resolveLastEventIdPath(accountId: string): string {
  return path.join(resolveShareCrmStateDir(), CHANNEL_ID, `last-event-id-${normalizeAccountIdForFile(accountId)}.json`);
}

export async function loadLastEventId(accountId: string): Promise<string | null> {
  const filePath = resolveLastEventIdPath(accountId);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { lastEventId?: unknown };
    const lastEventId = typeof parsed?.lastEventId === "string" ? parsed.lastEventId.trim() : "";
    return lastEventId || null;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeLastEventId(accountId: string, lastEventId: string | null): Promise<void> {
  const filePath = resolveLastEventIdPath(accountId);
  const dirPath = path.dirname(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(dirPath, { recursive: true, mode: DIR_MODE });

  try {
    await writeFile(tempPath, `${JSON.stringify({ lastEventId }, null, 2)}\n`, { mode: FILE_MODE });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function persistLastEventId(accountId: string, lastEventId: string | null): Promise<void> {
  const key = `last-event:${accountId}`;
  const previous = persistQueues.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => writeLastEventId(accountId, lastEventId));

  persistQueues.set(key, current);
  current.finally(() => {
    if (persistQueues.get(key) === current) {
      persistQueues.delete(key);
    }
  });
  return current;
}

export function persistDirectChatBindings(accountId: string, bindings: Map<string, string>): Promise<void> {
  const snapshot = new Map(bindings);
  const previous = persistQueues.get(accountId) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => writeDirectChatBindings(accountId, snapshot));

  persistQueues.set(accountId, current);
  current.finally(() => {
    if (persistQueues.get(accountId) === current) {
      persistQueues.delete(accountId);
    }
  });
  return current;
}
