import { isMap, parseAllDocuments } from "yaml";
import { z } from "zod";
import { otpSchema } from "./auth.schema";
import { idSchema } from "./tenant.schema";

const bytes = (text: string) => new TextEncoder().encode(text).length;
export const composeSchema = z.string().superRefine((content, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (bytes(content) > 65_536 || content.includes("\0")) {
    issue("compose.yaml maksimal 64 KiB.");
    return;
  }
  const documents = parseAllDocuments(content, { strict: true, uniqueKeys: true, logLevel: "silent" });
  if (documents.length !== 1 || documents[0].errors.length) {
    issue("Masukkan satu dokumen YAML yang valid, dengan kunci unik.");
    return;
  }
  const root = documents[0].contents;
  const services = isMap(root) ? root.get("services", true) : undefined;
  if (!isMap(services) || services.items.length === 0) issue("Tambahkan setidaknya satu service.");
});

export const envSchema = z.string().superRefine((text, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (bytes(text) > 16_384 || text.includes("\0")) {
    issue(".env maksimal 16 KiB.");
    return;
  }
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const key = line.slice(0, Math.max(separator, 0)).trim();
    const value = line.slice(separator + 1).trim();
    const quote = value[0];
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /^(COMPOSE|DOCKER)_/i.test(key)
      || value.includes("\r")
      || ((quote === "'" || quote === '"') && (value.length < 2 || value.at(-1) !== quote || /['"\\]/.test(value.slice(1, -1))))) {
      issue(`Periksa variabel NAME=value pada baris ${index + 1}.`);
      return;
    }
  }
});

export const runCommandSchema = z.string().trim().refine(
  (value) => value.startsWith("docker run ") && bytes(value) <= 4096 && !/[\r\n\0]/.test(value),
  "Masukkan satu perintah docker run, maksimal 4 KiB.",
);
export const stackCreateSchema = z.strictObject({
  node_id: idSchema,
  stack_name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/, "Gunakan huruf kecil, angka, garis bawah, atau tanda hubung."),
});
export const composeFormSchema = z.strictObject({
  compose: composeSchema, env: z.string(), replaceEnv: z.boolean(),
}).superRefine(({ replaceEnv, env }, context) => {
  if (!replaceEnv) return;
  const validation = envSchema.safeParse(env);
  if (!validation.success) context.addIssue({ code: "custom", path: ["env"], message: validation.error.issues[0].message });
});
export const stackControlSchema = z.enum(["read", "up", "down", "pull", "restart"]);
export const stackActionSchema = z.union([
  z.strictObject({ action: stackControlSchema, input: z.strictObject({}) }),
  z.strictObject({ action: z.literal("save"), input: z.strictObject({ compose: composeSchema, env: envSchema.optional() }) }),
  z.strictObject({ action: z.literal("convert"), input: z.strictObject({ command: runCommandSchema }) }),
]);
export const stackSchema = z.strictObject({
  ...stackCreateSchema.shape, id: idSchema, compose_path: z.string(),
  status: z.enum(["NEW", "READY", "RUNNING", "STOPPED", "ERROR"]),
  last_deployed_at: z.iso.datetime({ offset: true }).nullable(),
});
export const terminalCommandSchema = z.enum(["uptime", "df", "docker ps"]);
export const terminalFormSchema = z.strictObject({
  node_id: idSchema, command: terminalCommandSchema, otp: z.union([otpSchema, z.literal("")]),
});
export const terminalRequestSchema = terminalFormSchema.extend({ otp: otpSchema.optional() });
export const terminalNodeSchema = z.strictObject({ id: idSchema, name: z.string() });
export const opsJobSchema = z.strictObject({ job_id: idSchema, expires_at: z.iso.datetime({ offset: true }) });
export const opsOutputSchema = z.strictObject({ output: z.string() });
export const opsResultSchema = z.enum(["succeeded", "failed", "expired"]);
