import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getShareCrmRuntime } from "./runtime.js";

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

export function resolveDirectChatBindingsPath(accountId: string): string {
  const stateDir = getShareCrmRuntime().state.resolveStateDir();
  return path.join(stateDir, CHANNEL_ID, `user-chat-bindings-${normalizeAccountIdForFile(accountId)}.json`);
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
