import { z } from "zod";
import { idSchema } from "./tenant.schema";

export const otpSchema = z.string().regex(/^\d{6}$/, "Masukkan kode OTP 6 digit.");
export const otpFormSchema = z.strictObject({ otp: otpSchema });
const backupCode = z.string().trim().regex(/^[0-9a-f]{16}$/i, "Masukkan backup code 16 karakter heksadesimal.").toLowerCase();
const credentials = {
  username: z.string().trim().min(1, "Masukkan username.").max(128),
  password: z.string().min(1, "Masukkan password.").max(1024),
};
export const loginFormSchema = z.strictObject({
  ...credentials, company_id: z.union([idSchema, z.literal("")]),
});
export const backupFormSchema = loginFormSchema.extend({ backup_code: backupCode });
export const loginRequestSchema = z.strictObject({
  ...credentials,
  company_id: z.union([idSchema, z.literal("")]).nullish().transform((value) => value || null),
  backup_code: backupCode.optional(),
});
export const resetRequestSchema = z.strictObject({ email: z.string().trim().max(320).pipe(z.email("Masukkan alamat email yang valid.")) });
export const resetConfirmSchema = z.strictObject({ token: z.string().trim().min(16, "Token pemulihan tidak valid.").max(512) });

export const loginUserSchema = z.object({
  id: idSchema, username: z.string(), full_name: z.string(), company_id: idSchema, area_id: idSchema.nullable(),
});
export const sessionSchema = z.object({
  access_token: z.string().min(1), expires_in: z.number().finite(),
});
export const upstreamLoginSchema = z.discriminatedUnion("mfa_required", [
  z.object({ mfa_required: z.literal(true), mfa_challenge_token: z.string().min(1), user: loginUserSchema }),
  sessionSchema.extend({ mfa_required: z.literal(false), user: loginUserSchema }),
]);
