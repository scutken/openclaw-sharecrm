import { mkdir, writeFile } from "node:fs/promises";
import dns from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { tryGetShareCrmRuntime } from "./runtime.js";
import type { ShareCrmInboundImage } from "./types.js";

export const MAX_INBOUND_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_INBOUND_IMAGES = 8;
export const INBOUND_IMAGE_TIMEOUT_MS = 15_000;
export const INBOUND_IMAGE_MAX_REDIRECTS = 3;

export type StagedInboundImage = {
  path: string;
  filename: string;
  contentType: string;
};

export type StageInboundImagesResult = {
  staged: StagedInboundImage[];
  markdown: string;
  failed: number;
};

export type InboundMediaDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: (hostname: string) => Promise<string[]>;
  now?: () => number;
  stateDir?: string;
};

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function resolveOpenClawStateDir(override?: string): string {
  if (override) return override;
  const pluginRuntime = tryGetShareCrmRuntime();
  return pluginRuntime?.state?.resolveStateDir?.() ?? resolveStateDir() ?? path.join(os.homedir(), ".openclaw");
}

export function resolveInboundMediaDir(accountId: string, stateDir?: string): string {
  return path.join(resolveOpenClawStateDir(stateDir), "media", "inbound", sanitizePathPart(accountId || "default"));
}

export function sanitizeFilename(name: string | undefined, fallback = "image.png"): string {
  const base = path.basename((name ?? "").replace(/\\/g, "/")).trim();
  const cleaned = base.replace(/[^\w.\u4e00-\u9fff-]+/g, "_").replace(/^\.+/, "");
  if (!cleaned || cleaned === "_" || cleaned === ".") return fallback;
  return cleaned.slice(0, 120);
}

function sanitizePathPart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned || "default";
}

export function isBlockedIp(ip: string): boolean {
  const addr = ip.trim().replace(/^\[|\]$/g, "");
  if (addr.startsWith("::ffff:")) {
    return isBlockedIp(addr.slice(7));
  }
  if (net.isIP(addr) === 4) {
    const [a, b] = addr.split(".").map((part) => Number(part));
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIP(addr) === 6) {
    const normalized = addr.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return true;
    return false;
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost")) return true;
  if (net.isIP(host)) return isBlockedIp(host);
  return false;
}

async function lookupAddresses(
  hostname: string,
  lookupImpl?: InboundMediaDeps["lookupImpl"],
): Promise<string[]> {
  if (net.isIP(hostname)) return [hostname];
  if (lookupImpl) return lookupImpl(hostname);
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((entry) => entry.address);
}

async function assertPublicHttpsUrl(
  rawUrl: string,
  lookupImpl?: InboundMediaDeps["lookupImpl"],
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("invalid image url");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`unsupported image url protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("image url must not include userinfo");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("image host is not allowed");
  }
  const addresses = await lookupAddresses(parsed.hostname, lookupImpl);
  if (addresses.length === 0 || addresses.some((ip) => isBlockedIp(ip))) {
    throw new Error("image host resolves to a private address");
  }
  return parsed;
}

function sniffContentType(buffer: Buffer, headerType: string | null, filename: string): string {
  const header = (headerType ?? "").split(";")[0]?.trim().toLowerCase();
  if (header?.startsWith("image/")) return header;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return "image/gif";
  }
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  return "image/png";
}

async function fetchImageBytes(
  url: string,
  deps: InboundMediaDeps,
  redirectsLeft: number,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const parsed = await assertPublicHttpsUrl(url, deps.lookupImpl);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(parsed, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(INBOUND_IMAGE_TIMEOUT_MS),
    headers: { Accept: "image/*,*/*;q=0.8" },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || redirectsLeft <= 0) {
      throw new Error(`image download redirect failed (${response.status})`);
    }
    return fetchImageBytes(new URL(location, parsed).toString(), deps, redirectsLeft - 1);
  }
  if (!response.ok) {
    throw new Error(`image download failed (${response.status})`);
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_INBOUND_IMAGE_BYTES) {
    throw new Error("image exceeds size limit");
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_INBOUND_IMAGE_BYTES) {
    throw new Error("image exceeds size limit");
  }
  if (body.length === 0) {
    throw new Error("image download returned empty body");
  }
  return { buffer: body, contentType: response.headers.get("content-type") };
}

export function formatStagedInboundImages(staged: StagedInboundImage[]): string {
  return staged.map((image) => `![${image.filename}](${image.path})`).join("\n");
}

export async function stageInboundImages(params: {
  images?: ShareCrmInboundImage[];
  accountId: string;
  messageId: string;
  deps?: InboundMediaDeps;
}): Promise<StageInboundImagesResult> {
  const images = (params.images ?? []).filter((image) => image?.url?.trim());
  if (images.length === 0) {
    return { staged: [], markdown: "", failed: 0 };
  }

  const limited = images.slice(0, MAX_INBOUND_IMAGES);
  const mediaDir = resolveInboundMediaDir(params.accountId, params.deps?.stateDir);
  await mkdir(mediaDir, { recursive: true, mode: 0o700 });

  const staged: StagedInboundImage[] = [];
  let failed = 0;
  const usedNames = new Set<string>();

  for (const [index, image] of limited.entries()) {
    const filename = allocateName(sanitizeFilename(image.filename), usedNames);
    try {
      const downloaded = await fetchImageBytes(image.url!.trim(), params.deps ?? {}, INBOUND_IMAGE_MAX_REDIRECTS);
      const contentType = sniffContentType(downloaded.buffer, downloaded.contentType, filename);
      const filePath = path.join(
        mediaDir,
        `${sanitizePathPart(params.messageId || "msg")}-${index}-${filename}`,
      );
      await writeFile(filePath, downloaded.buffer, { mode: 0o600 });
      staged.push({ path: filePath, filename, contentType });
    } catch {
      failed += 1;
    }
  }

  return {
    staged,
    markdown: formatStagedInboundImages(staged),
    failed,
  };
}

function allocateName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const parsed = path.parse(name);
  let suffix = 1;
  let next = `${parsed.name}-${suffix}${parsed.ext}`;
  while (used.has(next)) {
    suffix += 1;
    next = `${parsed.name}-${suffix}${parsed.ext}`;
  }
  used.add(next);
  return next;
}
