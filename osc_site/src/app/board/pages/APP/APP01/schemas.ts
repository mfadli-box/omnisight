import { z } from "zod";

export const moduleSchema = z.object({
  parent_id: z.string().optional(),
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  path: z.string().min(1, "Path is required"),
  is_page: z.boolean(),
  is_active: z.boolean(),
});

export type ModuleFormValues = z.infer<typeof moduleSchema>;

export const apiKeySchema = z.object({
  name: z.string().min(1, "Name is required"),
  scopes: z.string().optional(),
  environment_id: z.string().optional(),
  ip_allowlist: z.string().optional(),
  expires_at: z.string().optional(),
});
