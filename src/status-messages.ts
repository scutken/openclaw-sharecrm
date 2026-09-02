export const DEFAULT_ACK_MESSAGES = [
  "👀已收到，稍后回您！",
];

export const DEFAULT_PROGRESS_MESSAGES = [
  "⏳仍在工作，已处理 {elapsed}",
];

export const DEFAULT_ACK_ENABLED = true;
export const DEFAULT_PROGRESS_ENABLED = true;
export const DEFAULT_GROUP_ACK_ENABLED = true;
export const DEFAULT_GROUP_PROGRESS_ENABLED = false;
export const DEFAULT_PROGRESS_DELAY_MS = 20_000;
export const DEFAULT_PROGRESS_INTERVAL_MS = 45_000;
export const DEFAULT_PROGRESS_MAX_TIMES = 3;
export const DEFAULT_PROGRESS_SCHEDULE_MS = [60_000, 180_000, 360_000];
export const DEFAULT_PROGRESS_REPEAT_MS = 180_000;
export const DEFAULT_PROGRESS_SCHEDULE_MAX_TIMES = 20;
export const ACK_THROTTLE_MS = 60_000;
export const REJECT_HINT_THROTTLE_MS = 5 * 60_000;
export const STATUS_MESSAGE_MAX_CHARS = 80;

export const GROUP_REJECT_HINTS = {
  disabled: "群聊功能当前未开启。请在 OpenClaw Dashboard 把 ShareCRM 的 Group Policy 改为 open 或 allowlist 后再试。",
  notAllowlisted: "当前群不在白名单中。请把本群 chat_id 加到 groupAllowFrom，或把 Group Policy 改为 open。",
  missingMention: "群聊需要先 @Bot。当前 @ 的显示名不在 Mention Aliases 中，请在 OpenClaw Dashboard 把该名字加到 Mention Aliases。",
} as const;

export type GroupRejectReason = keyof typeof GROUP_REJECT_HINTS;

export function extractAtMentionNames(text: string): string[] {
  const names: string[] = [];
  const matches = text.matchAll(/@([^\s@,:：，]+)/g);
  for (const match of matches) {
    const name = match[1]?.trim();
    if (!name) continue;
    if (names.some((entry) => entry.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
  }
  return names;
}

export function buildGroupRejectHint(reason: GroupRejectReason, names?: string[]): string {
  if (reason !== "missingMention") return GROUP_REJECT_HINTS[reason];
  const listed = (names ?? []).map((name) => `@${name.replace(/^@/, "")}`).filter(Boolean);
  if (listed.length === 0) return GROUP_REJECT_HINTS.missingMention;
  return `群聊需要 @Bot 才会处理。当前消息里的 ${listed.join("、")} 不在 Mention Aliases 中，请在 OpenClaw Dashboard 把该显示名加到 ShareCRM 的 Mention Aliases。`;
}

export type StatusMessageConfig = {
  enabled?: boolean;
  messages?: string | string[];
};

export type ProgressMessageConfig = StatusMessageConfig & {
  delayMs?: number;
  intervalMs?: number;
  maxTimes?: number;
  scheduleMs?: number[];
  repeatMs?: number;
};

function clampPositiveInt(value: unknown, fallback: number, min = 1): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return seconds > 0 ? `${totalMinutes}分${seconds}秒` : `${totalMinutes}分`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
}

export function normalizeMessagePool(value: unknown, fallback: string[]): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : fallback;
  }
  if (Array.isArray(value)) {
    const messages = value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
    return messages.length > 0 ? messages : fallback;
  }
  return fallback;
}

export function pickMessage(pool: string[], random = Math.random): string {
  if (pool.length === 0) return "";
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index] ?? pool[0] ?? "";
}

export function truncateStatusMessage(text: string, maxChars = STATUS_MESSAGE_MAX_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trim()}…`;
}

export function renderStatusMessage(
  template: string,
  vars: {
    elapsedMs?: number;
    round?: number;
    max?: number;
    name?: string;
    bot?: string;
  },
): string {
  const elapsed = formatElapsed(vars.elapsedMs ?? 0);
  const rendered = template
    .replaceAll("{elapsed}", elapsed)
    .replaceAll("{round}", String(vars.round ?? 1))
    .replaceAll("{max}", String(vars.max ?? 1))
    .replaceAll("{name}", (vars.name ?? "").trim())
    .replaceAll("{bot}", (vars.bot ?? "").trim());
  return truncateStatusMessage(rendered);
}

export function isLikelyCommandText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return /^(?:\/[a-zA-Z][\w-]*|!!|![a-zA-Z][\w-]*)(?:\s|$)/.test(trimmed);
}

export function resolveAckSettings(config?: {
  ack?: StatusMessageConfig;
  groupAck?: StatusMessageConfig;
}, isGroup = false): { enabled: boolean; messages: string[] } {
  const scoped = isGroup ? config?.groupAck : undefined;
  const base = config?.ack;
  const defaultEnabled = isGroup ? DEFAULT_GROUP_ACK_ENABLED : DEFAULT_ACK_ENABLED;
  return {
    enabled: scoped?.enabled ?? base?.enabled ?? defaultEnabled,
    messages: normalizeMessagePool(scoped?.messages ?? base?.messages, DEFAULT_ACK_MESSAGES),
  };
}

export function normalizeScheduleMs(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const schedule = value
    .map((entry) => clampPositiveInt(entry, 0, 1000))
    .filter((entry) => entry > 0);
  return schedule.length > 0 ? schedule : fallback;
}

export function progressOffsetMs(index: number, scheduleMs: number[], repeatMs: number): number {
  if (index < 0) return 0;
  if (index < scheduleMs.length) return scheduleMs[index] ?? 0;
  const last = scheduleMs[scheduleMs.length - 1] ?? 0;
  return last + (index - scheduleMs.length + 1) * repeatMs;
}

export function resolveProgressSettings(config?: {
  progress?: ProgressMessageConfig;
  groupProgress?: ProgressMessageConfig;
}, isGroup = false): {
  enabled: boolean;
  delayMs: number;
  intervalMs: number;
  maxTimes: number;
  messages: string[];
  scheduleMs?: number[];
  repeatMs?: number;
} {
  const scoped = isGroup ? config?.groupProgress : undefined;
  const base = config?.progress;
  const defaultEnabled = isGroup ? DEFAULT_GROUP_PROGRESS_ENABLED : DEFAULT_PROGRESS_ENABLED;
  const hasExplicitSchedule = scoped?.scheduleMs != null || base?.scheduleMs != null;
  const hasExplicitLegacyTiming =
    scoped?.delayMs != null ||
    scoped?.intervalMs != null ||
    base?.delayMs != null ||
    base?.intervalMs != null;
  const useSchedule = hasExplicitSchedule || !hasExplicitLegacyTiming;

  if (useSchedule) {
    const scheduleMs = normalizeScheduleMs(scoped?.scheduleMs ?? base?.scheduleMs, DEFAULT_PROGRESS_SCHEDULE_MS);
    const repeatMs = clampPositiveInt(scoped?.repeatMs ?? base?.repeatMs, DEFAULT_PROGRESS_REPEAT_MS, 1000);
    return {
      enabled: scoped?.enabled ?? base?.enabled ?? defaultEnabled,
      delayMs: scheduleMs[0] ?? DEFAULT_PROGRESS_DELAY_MS,
      intervalMs: repeatMs,
      maxTimes: clampPositiveInt(scoped?.maxTimes ?? base?.maxTimes, DEFAULT_PROGRESS_SCHEDULE_MAX_TIMES, 1),
      messages: normalizeMessagePool(scoped?.messages ?? base?.messages, DEFAULT_PROGRESS_MESSAGES),
      scheduleMs,
      repeatMs,
    };
  }

  return {
    enabled: scoped?.enabled ?? base?.enabled ?? defaultEnabled,
    delayMs: clampPositiveInt(scoped?.delayMs ?? base?.delayMs, DEFAULT_PROGRESS_DELAY_MS, 1000),
    intervalMs: clampPositiveInt(scoped?.intervalMs ?? base?.intervalMs, DEFAULT_PROGRESS_INTERVAL_MS, 1000),
    maxTimes: clampPositiveInt(scoped?.maxTimes ?? base?.maxTimes, DEFAULT_PROGRESS_MAX_TIMES, 1),
    messages: normalizeMessagePool(scoped?.messages ?? base?.messages, DEFAULT_PROGRESS_MESSAGES),
  };
}
