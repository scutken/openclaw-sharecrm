import { readFile } from "node:fs/promises";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { shareCrmPlugin } from "./src/channel.js";
import { isLikelyShareCrmChatId } from "./src/channel.js";
import { setShareCrmRuntime } from "./src/runtime.js";

export { monitorShareCrmProvider, stopShareCrmMonitor } from "./src/monitor.js";
export { shareCrmPlugin } from "./src/channel.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function stripThreadSuffix(sessionKey: string): string {
  const normalized = sessionKey.trim();
  if (!normalized) return normalized;
  const lower = normalized.toLowerCase();
  const topicIndex = lower.lastIndexOf(":topic:");
  const threadIndex = lower.lastIndexOf(":thread:");
  const markerIndex = Math.max(topicIndex, threadIndex);
  return markerIndex > 0 ? normalized.slice(0, markerIndex).trim() || normalized : normalized;
}

async function loadSessionEntry(api: OpenClawPluginApi, sessionKey: string, agentId?: string) {
  const storePath = api.runtime.channel.session.resolveStorePath(api.config.session?.store, agentId ? { agentId } : undefined);

  try {
    const raw = await readFile(storePath, "utf8");
    const store = JSON.parse(raw) as Record<string, JsonRecord>;
    const baseSessionKey = stripThreadSuffix(sessionKey);

    for (const candidate of [sessionKey, sessionKey.toLowerCase(), baseSessionKey, baseSessionKey.toLowerCase()]) {
      if (candidate && isRecord(store[candidate])) return store[candidate];
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveShareCrmDelivery(entry: JsonRecord | undefined) {
  if (!entry) return undefined;

  const deliveryContext = isRecord(entry.deliveryContext) ? entry.deliveryContext : undefined;
  const origin = isRecord(entry.origin) ? entry.origin : undefined;
  const channel = normalizeString(deliveryContext?.channel) ?? normalizeString(origin?.channel) ?? normalizeString(entry.lastChannel);
  const to = normalizeString(deliveryContext?.to) ?? normalizeString(origin?.to) ?? normalizeString(entry.lastTo);
  const accountId = normalizeString(deliveryContext?.accountId) ?? normalizeString(origin?.accountId) ?? normalizeString(entry.lastAccountId);

  if ((channel ?? "").toLowerCase() !== "sharecrm" || !to) return undefined;
  return { channel: "sharecrm", to, accountId };
}

function isValidShareCrmDeliveryTarget(target: string): boolean {
  const trimmed = target.trim();
  if (!trimmed) return false;
  if (/^chat:/i.test(trimmed)) return isLikelyShareCrmChatId(trimmed.slice(5));
  return isLikelyShareCrmChatId(trimmed);
}

function isObviouslyInvalidShareCrmDeliveryTarget(target: string): boolean {
  const trimmed = target.trim();
  if (!trimmed) return true;
  if (["heartbeat", "last"].includes(trimmed.toLowerCase())) return true;
  if (trimmed.includes(":chat:") && !trimmed.toLowerCase().startsWith("chat:")) return true;
  if (/^user:/i.test(trimmed)) return false;
  return !isValidShareCrmDeliveryTarget(trimmed);
}

function shouldRewriteShareCrmDelivery(delivery: unknown): boolean {
  if (!isRecord(delivery)) return true;

  const mode = (normalizeString(delivery.mode) ?? "announce").toLowerCase();
  if (mode !== "announce") return false;

  const channel = normalizeString(delivery.channel)?.toLowerCase();
  const to = normalizeString(delivery.to);

  if (!channel && !to) return true;
  if (channel && channel !== "sharecrm") return false;
  if (!to) return true;
  if (channel === "sharecrm") return isObviouslyInvalidShareCrmDeliveryTarget(to);
  return to.includes(":chat:") && !to.toLowerCase().startsWith("chat:");
}

function patchShareCrmDelivery(target: JsonRecord, resolved: { channel: string; to: string; accountId?: string }) {
  const currentDelivery = isRecord(target.delivery) ? target.delivery : {};
  return {
    ...target,
    delivery: {
      ...currentDelivery,
      mode: normalizeString(currentDelivery.mode) ?? "announce",
      channel: resolved.channel,
      to: resolved.to,
      ...(normalizeString(currentDelivery.accountId) ? {} : resolved.accountId ? { accountId: resolved.accountId } : {}),
    },
  };
}

export async function rewriteShareCrmCronDeliveryFromSession(params: {
  api: OpenClawPluginApi;
  logger: Pick<OpenClawPluginApi["logger"], "info" | "warn">;
  sessionKey: string;
  agentId?: string;
  target: JsonRecord;
}) {
  if (!shouldRewriteShareCrmDelivery(params.target.delivery)) return;

  const sessionEntry = await loadSessionEntry(params.api, params.sessionKey, params.agentId);
  const resolved = resolveShareCrmDelivery(sessionEntry);
  if (!resolved) {
    params.logger.warn(`sharecrm: unable to resolve cron delivery target from session ${params.sessionKey}`);
    return;
  }

  params.logger.info(`sharecrm: rewrote cron delivery target from session context (${params.sessionKey})`);
  return patchShareCrmDelivery(params.target, resolved);
}

const plugin = {
  id: "sharecrm",
  name: "ShareCRM",
  description: "ShareCRM IM Gateway channel plugin for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setShareCrmRuntime(api.runtime);
    api.registerChannel({ plugin: shareCrmPlugin });
    api.on("before_tool_call", async (event, ctx) => {
      if (event.toolName !== "cron" || !ctx.sessionKey) return;

      const action = normalizeString(event.params.action)?.toLowerCase();
      const targetKey = action === "add" ? "job" : action === "update" ? "patch" : undefined;
      if (!targetKey) return;

      const target = event.params[targetKey];
      if (!isRecord(target)) return;

      const sessionKey = normalizeString(target.sessionKey) ?? ctx.sessionKey;
      if (!sessionKey) return;

      const rewritten = await rewriteShareCrmCronDeliveryFromSession({
        api,
        logger: api.logger,
        sessionKey,
        agentId: ctx.agentId,
        target,
      });
      if (!rewritten) return;

      return {
        params: {
          ...event.params,
          [targetKey]: rewritten,
        },
      };
    });
  },
};

export default plugin;
