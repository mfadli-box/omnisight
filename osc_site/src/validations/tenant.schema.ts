import { z } from "zod";

export const idSchema = z.guid();
export const moduleCodeSchema = z.string().regex(/^[A-Z]{2}[0-9]{2}$/);
export const companySchema = z.object({ id: idSchema, code: z.string(), name: z.string() });
export const areaSchema = z.object({ id: idSchema, name: z.string() });
export const companyContextSchema = companySchema.pick({ id: true, name: true }).extend({
  company_wide: z.boolean(),
  areas: z.array(areaSchema),
});
export const switchContextSchema = z.strictObject({
  company_id: idSchema,
  area_id: idSchema.nullable(),
});
export const switchRequestSchema = switchContextSchema.extend({
  area_id: z.union([idSchema, z.literal("")]).nullish().transform((value) => value || null),
});
export const switchContextFormSchema = switchContextSchema.extend({
  area_id: z.union([idSchema, z.literal("")]),
});
export const contextSchema = z.object({
  company_id: idSchema.nullable(),
  area_id: idSchema.nullable(),
  area_ids: z.array(idSchema),
});
export const navigationItemSchema = z.object({
  group_code: z.string().regex(/^[A-Z]{2}$/),
  group_name: z.string(),
  module_code: moduleCodeSchema,
  module_name: z.string(),
});
export const navigationSchema = z.object({ data: z.array(navigationItemSchema), context: contextSchema });

export type Company = z.infer<typeof companySchema>;
export type CompanyContext = z.infer<typeof companyContextSchema>;
export type NavigationItem = z.infer<typeof navigationItemSchema>;
export type WorkspaceContext = z.infer<typeof contextSchema>;
