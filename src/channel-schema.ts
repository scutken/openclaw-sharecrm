export const shareCrmStatusMessageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    messages: {
      oneOf: [
        { type: "string" },
        { type: "array", items: { type: "string" } },
      ],
    },
  },
} as const;

export const shareCrmProgressMessageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    delayMs: { type: "integer", minimum: 1000 },
    intervalMs: { type: "integer", minimum: 1000 },
    maxTimes: { type: "integer", minimum: 1 },
    scheduleMs: { type: "array", items: { type: "integer", minimum: 1000 } },
    repeatMs: { type: "integer", minimum: 1000 },
    messages: {
      oneOf: [
        { type: "string" },
        { type: "array", items: { type: "string" } },
      ],
    },
  },
} as const;

export const shareCrmAccountSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    name: { type: "string" },
    gatewayBaseUrl: { type: "string" },
    appId: { type: "string" },
    appSecret: { type: "string" },
    dmPolicy: {
      type: "string",
      enum: ["open", "pairing", "allowlist", "disabled"],
    },
    allowFrom: {
      type: "array",
      items: { oneOf: [{ type: "string" }, { type: "number" }] },
    },
    groupPolicy: {
      type: "string",
      enum: ["open", "allowlist", "disabled"],
    },
    groupAllowFrom: {
      type: "array",
      items: { oneOf: [{ type: "string" }, { type: "number" }] },
    },
    requireMention: { type: "boolean", default: true },
    mentionAliases: {
      type: "array",
      items: { oneOf: [{ type: "string" }, { type: "number" }] },
    },
    historyLimit: { type: "integer", minimum: 0 },
    textChunkLimit: { type: "integer", minimum: 1 },
    ack: shareCrmStatusMessageSchema,
    progress: shareCrmProgressMessageSchema,
    groupAck: shareCrmStatusMessageSchema,
    groupProgress: shareCrmProgressMessageSchema,
  },
} as const;

export const shareCrmChannelSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    gatewayBaseUrl: { type: "string" },
    appId: { type: "string" },
    appSecret: { type: "string" },
    dmPolicy: {
      type: "string",
      enum: ["open", "pairing", "allowlist", "disabled"],
    },
    allowFrom: {
      type: "array",
      items: { oneOf: [{ type: "string" }, { type: "number" }] },
    },
    groupPolicy: {
      type: "string",
      enum: ["open", "allowlist", "disabled"],
    },
    groupAllowFrom: {
      type: "array",
      items: { oneOf: [{ type: "string" }, { type: "number" }] },
    },
    requireMention: { type: "boolean", default: true },
    mentionAliases: {
      type: "array",
      items: { oneOf: [{ type: "string" }, { type: "number" }] },
    },
    chatId: { type: "string" },
    historyLimit: { type: "integer", minimum: 0 },
    textChunkLimit: { type: "integer", minimum: 1 },
    ack: shareCrmStatusMessageSchema,
    progress: shareCrmProgressMessageSchema,
    groupAck: shareCrmStatusMessageSchema,
    groupProgress: shareCrmProgressMessageSchema,
    accounts: {
      type: "object",
      additionalProperties: shareCrmAccountSchema,
    },
  },
} as const;
