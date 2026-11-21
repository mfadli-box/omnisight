import { z } from "zod";
import { idSchema } from "./tenant.schema";

export const markdownSchema = z.string().regex(/^[^\0]*$/).refine(
  (text) => new TextEncoder().encode(text).byteLength <= 256 * 1024,
  "Isi Markdown maksimum 256 KiB.",
);
export const attachmentTypes = {
  pdf: "application/pdf",
  txt: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export function attachmentType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() as keyof typeof attachmentTypes;
  return Object.hasOwn(attachmentTypes, extension) ? attachmentTypes[extension] : undefined;
}
export const attachmentSchema = z.strictObject({
  attachment: z.file().min(1, "Pilih file.").max(20 * 1024 * 1024, "Ukuran file maksimum 20 MiB.")
    .refine((file) => attachmentType(file.name) !== undefined, "Pilih PDF, DOCX, atau TXT."),
});
export const attachmentResultSchema = z.object({ document_id: idSchema, uploaded: z.literal(true) });
