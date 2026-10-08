import { z } from "zod";

export const SESSION_STATUSES = ["ACTIVE", "EXPIRED", "ENDED", "REVOKED"] as const;

export const TOKEN_TYPES = ["JWT", "WEB", "REFRESH", "API"] as const;

export const sessionSchema = z.object({
  user_id: z.string().min(1, "User is required"),
  session_token: z.string().min(1, "Session token is required"),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  status: z.enum(SESSION_STATUSES),
  policy_id: z.string().optional(),
});
export type SessionFormValues = z.infer<typeof sessionSchema>;

export const tokenSchema = z.object({
  user_id: z.string().min(1, "User is required"),
  token_type: z.enum(TOKEN_TYPES),
  token: z.string().min(1, "Token is required"),
  refresh_token: z.string().optional(),
  fingerprint: z.string().optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  device_id: z.string().optional(),
  access_expires_at: z.string().min(1, "Access expiry is required"),
  refresh_expires_at: z.string().optional(),
  is_blocked: z.boolean(),
  blocked_reason: z.string().optional(),
});
export type TokenFormValues = z.infer<typeof tokenSchema>;