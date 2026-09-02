export const DEFAULT_DM_POLICY = "pairing" as const;
export const DEFAULT_GROUP_POLICY = "disabled" as const;
export const DEFAULT_REQUIRE_MENTION = true;

export type ShareCrmDmPolicy = "open" | "pairing" | "allowlist" | "disabled";
export type ShareCrmGroupPolicy = "open" | "allowlist" | "disabled";

export function normalizeAllowFrom(entries: unknown[] | undefined): string[] {
  return (entries ?? [])
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

export function normalizeAllowEntry(entry: string): string {
  return entry.replace(/^sharecrm:/i, "").replace(/^user:/i, "").trim();
}

export function hasOpenWildcard(allowFrom: string[]): boolean {
  return allowFrom.some((entry) => entry.trim() === "*");
}

export function isSenderAllowlisted(senderId: string, allowFrom: string[]): boolean {
  const id = senderId.trim();
  if (!id) return false;

  return allowFrom.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    if (trimmed === "*") return true;
    return normalizeAllowEntry(trimmed) === id;
  });
}

export function isDirectMessageAuthorized(params: {
  dmPolicy?: string;
  senderId: string;
  allowFrom?: unknown[];
}): boolean {
  const policy = (params.dmPolicy ?? DEFAULT_DM_POLICY).toLowerCase();
  const allowFrom = normalizeAllowFrom(params.allowFrom);

  if (policy === "disabled") return false;
  if (policy === "open") {
    if (hasOpenWildcard(allowFrom)) return true;
    return isSenderAllowlisted(params.senderId, allowFrom);
  }
  if (policy === "allowlist" || policy === "pairing") {
    return isSenderAllowlisted(params.senderId, allowFrom);
  }
  return false;
}

export function collectDmPolicyWarnings(params: {
  accountId: string;
  dmPolicy?: string;
  allowFrom?: unknown[];
}): string[] {
  const policy = (params.dmPolicy ?? DEFAULT_DM_POLICY).toLowerCase();
  const allowFrom = normalizeAllowFrom(params.allowFrom);
  const warnings: string[] = [];

  if (policy === "open" && hasOpenWildcard(allowFrom)) {
    warnings.push(
      `- ShareCRM[${params.accountId}]: dmPolicy="open" with allowFrom=["*"] allows any user to message the bot.`,
    );
  } else if (policy === "open") {
    warnings.push(
      `- ShareCRM[${params.accountId}]: dmPolicy="open" without allowFrom=["*"] is not public; unknown senders are denied. Add "*" to allow anyone, or use pairing/allowlist.`,
    );
  }

  return warnings;
}

export function isSelfBotMessage(params: {
  senderId: string;
  botFullId?: string;
}): boolean {
  const senderId = params.senderId.trim();
  const botFullId = params.botFullId?.trim();
  if (!senderId || !botFullId) return false;
  if (senderId === botFullId) return true;
  const shortId = botFullId.split(".").pop();
  return Boolean(shortId && senderId === shortId);
}
