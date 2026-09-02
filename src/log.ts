const SENSITIVE_KEY = /secret|token|authorization|password|accessToken|appSecret/i;

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", "***");
    }
    return parsed.toString();
  } catch {
    return url.replace(/([?&]token=)[^&]+/gi, "$1***");
  }
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = entry ? "***" : entry;
      continue;
    }
    output[key] = redactSensitive(entry);
  }
  return output;
}

export function redactLogArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === "string") return redactUrl(arg);
    return redactSensitive(arg);
  });
}
