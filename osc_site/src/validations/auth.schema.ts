import { z } from "zod";

export const loginSchema = z.object({
  company_id: z.string().uuid(),
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1),
}).strict();
export type Login = z.infer<typeof loginSchema>;
export const otpSchema = z.object({ otp: z.string().regex(/^[0-9]{6}$/) }).strict();
export const companySchema = z.object({ id: z.string().uuid(), label: z.string().min(1) });
export type Company = z.infer<typeof companySchema>;
export const verifySchema = otpSchema.extend({ attempt_id: z.string().uuid() });
export const resultSchema = z.discriminatedUnion("mfa_required", [
  z.object({ mfa_required: z.literal(true), attempt_id: z.string().uuid(), warning_flag: z.boolean() }),
  z.object({ mfa_required: z.literal(false), warning_flag: z.boolean() }),
]);
