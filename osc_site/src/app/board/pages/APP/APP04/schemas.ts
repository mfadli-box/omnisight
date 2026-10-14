import { z } from "zod";

export const STEP_CONDITIONS = ["ANY_APPROVED", "ALL_APPROVED"] as const;

export const SIGNATURE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export const signatureTypeSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
});
export type SignatureTypeFormValues = z.infer<typeof signatureTypeSchema>;

export const approvalStepSchema = z.object({
  step: z.coerce.number().int().min(1, "Step must be >= 1"),
  condition: z.enum(STEP_CONDITIONS),
});
export type ApprovalStepFormValues = z.infer<typeof approvalStepSchema>;

export const approvalSignSchema = z.object({
  user_id: z.string().min(1, "User is required"),
});
export type ApprovalSignFormValues = z.infer<typeof approvalSignSchema>;

export const signatureFormSchema = z.object({
  signature_type_id: z.string().optional(),
  step: z.coerce.number().int().min(1, "Step must be >= 1"),
  request_id: z.string().min(1, "Request ID is required"),
  condition: z.enum(STEP_CONDITIONS),
  status: z.enum(SIGNATURE_STATUSES),
});
export type SignatureFormFormValues = z.infer<typeof signatureFormSchema>;

export const signatureFlagSchema = z.object({
  user_id: z.string().min(1, "User is required"),
  status: z.enum(SIGNATURE_STATUSES),
  comment: z.string().optional(),
});
export type SignatureFlagFormValues = z.infer<typeof signatureFlagSchema>;