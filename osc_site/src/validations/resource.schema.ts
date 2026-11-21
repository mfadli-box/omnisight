import { z } from "zod";
import { idSchema, moduleCodeSchema } from "./tenant.schema";
import { pamProtocolSchema } from "./pam.schema";
import { markdownSchema } from "./sop.schema";

export const text = (max = 255) => z.string().trim().min(1, "Wajib diisi.").max(max).regex(/^[^\0]+$/);
const area_id = idSchema.nullable().optional();
const organization = z.strictObject({ code: text(), name: text() });
const node = z.strictObject({
  store_id: idSchema, os_type: text(), node_code: text().nullish(), display_name: text().nullish(),
  hostname: text().nullish(), ip_address: text().nullish(), agent_version: text().nullish(),
});
const target = z.strictObject({
  target_code: text(), display_name: text(), hostname: text(),
  port: z.number().int().min(1).max(65535), protocol: pamProtocolSchema, credential_ref: text(512).nullish(),
});
const document = z.strictObject({ document_code: text(), title: text(), markdown_content: markdownSchema.optional() });
const store = organization.extend({ network_ip_cidr: text(), status: text().optional() });
const userDetails = z.strictObject({ full_name: text(200), email: z.email().max(320).nullish() });
const user = userDetails.extend({
  username: text(128), password: z.string().min(12).max(1024), role_id: idSchema, area_id,
});
const role = z.strictObject({ role_code: text(48), role_name: text(120) });

const nonEmpty = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.partial().refine((value) => Object.keys(value).length > 0, "Isi data yang akan diubah.");

export const resourceSchemas = {
  nodes: { create: node, update: nonEmpty(node.omit({ store_id: true })) },
  "pam/targets": { create: target.extend({ area_id }), update: nonEmpty(target) },
  "sop-documents": { create: document.extend({ area_id }), update: nonEmpty(document) },
  companies: { create: organization, update: nonEmpty(organization) },
  areas: { create: organization, update: nonEmpty(organization) },
  stores: { create: store.extend({ area_id }), update: nonEmpty(store) },
  users: { create: user, update: nonEmpty(userDetails) },
  roles: { create: role },
};
export const rowSchema = z.looseObject({ id: z.union([idSchema, z.number().int().nonnegative()]) });
export const rowListSchema = z.array(rowSchema);
export type DataRow = z.infer<typeof rowSchema>;

export const permissionSchema = z.strictObject({
  can_view: z.boolean(), can_create: z.boolean(), can_update: z.boolean(), can_delete: z.boolean(),
});
export const grantSchema = permissionSchema.extend({ role_id: idSchema }).strip();
export const menuSchema = permissionSchema.extend({
  module_code: moduleCodeSchema, title: z.string(), is_enabled: z.boolean(), role_grants: z.array(grantSchema),
}).strip();

export const providerSchema = z.enum(["LOCAL", "HRIS_ASMX"]);
const ttl = z.number().int().min(1).max(8760);
export const connectorSchema = z.object({
  auth_provider: providerSchema, configured: z.boolean(), hris_cache_ttl_hours: ttl,
});
const template = z.string().trim().max(2048).refine(
  (value) => /^https?:\/\//i.test(value) && value.includes("{U}") && value.includes("{P}"),
  "Masukkan template HTTP(S) dengan {U} dan {P}.",
);
export const connectorFormSchema = z.strictObject({
  auth_provider: providerSchema, hris_cache_ttl_hours: ttl, hris_login_url: z.string(),
}).superRefine((value, ctx) => {
  if (value.auth_provider === "HRIS_ASMX" && !template.safeParse(value.hris_login_url).success) {
    ctx.addIssue({ code: "custom", path: ["hris_login_url"], message: "Masukkan template HTTP(S) dengan {U} dan {P}." });
  }
});
export const connectorRequestSchema = z.discriminatedUnion("auth_provider", [
  z.strictObject({ auth_provider: z.literal("LOCAL"), hris_cache_ttl_hours: ttl.optional(), hris_login_url: z.null().optional() }),
  z.strictObject({ auth_provider: z.literal("HRIS_ASMX"), hris_cache_ttl_hours: ttl.optional(), hris_login_url: template }),
]);
