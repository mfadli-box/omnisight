import { z } from "zod";
import { otpSchema } from "./auth.schema";
import { idSchema } from "./tenant.schema";

export const pamFormSchema = z.strictObject({
  reason: z.string().trim().min(1, "Masukkan alasan akses.").max(1000).regex(/^[^\0]+$/),
  otp: z.union([otpSchema, z.literal("")]),
});
export const pamRequestSchema = pamFormSchema.extend({ target_id: idSchema, otp: otpSchema.optional() });
export const pamSessionSchema = z.object({
  session_id: idSchema, state: z.literal("AUTHORIZED"), expires_at: z.string(),
});
export const pamProtocolSchema = z.enum(["SSH", "RDP", "HTTPS"]);
