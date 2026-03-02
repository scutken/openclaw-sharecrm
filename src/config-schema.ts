/**
 * ShareCRM 配置 Schema
 * 使用 Zod 进行配置验证
 */

import { z } from "zod";

/**
 * 单账号配置 Schema
 */
const ShareCrmAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  botToken: z.string().optional(),
  chatId: z.string().optional(),
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(z.string()).optional(),
});

/**
 * ShareCRM 完整配置 Schema
 */
export const ShareCrmConfigSchema = ShareCrmAccountSchema.extend({
  gatewayUrl: z.string(),
  accounts: z.record(ShareCrmAccountSchema).optional(),
});

export type ShareCrmConfig = z.infer<typeof ShareCrmConfigSchema>;
export type ShareCrmAccountConfig = z.infer<typeof ShareCrmAccountSchema>;

/**
 * 解析后的账号配置
 */
export interface ResolvedShareCrmAccount {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  gatewayUrl: string;
  botToken: string;
  chatId?: string;
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom: string[];
}
