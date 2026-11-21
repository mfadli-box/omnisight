import { z } from "zod";
import { idSchema } from "./tenant.schema";

const location = { node_id: idSchema, company_id: idSchema, area_id: idSchema, store_id: idSchema, recorded_at: z.string() };
export const containerSchema = z.object({
  ...location, id: z.string().regex(/^[a-f0-9]{12,64}$/), name: z.string(), image: z.string(),
  state: z.string(), image_update_status: z.string(),
});
export const sbomSchema = z.object({
  ...location, container_id: z.string().regex(/^[a-f0-9]{12,64}$/), image: z.string(), status: z.enum(["available", "unsupported", "unavailable", "too_large"]),
  packages: z.array(z.object({ name: z.string(), version: z.string(), type: z.string() })),
});
export const containerActionSchema = z.strictObject({ node_id: idSchema, action: z.enum(["start", "stop", "prune"]) });
export type Container = z.infer<typeof containerSchema>;
export type Sbom = z.infer<typeof sbomSchema>;
