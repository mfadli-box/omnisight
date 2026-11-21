"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiData, apiResponse, download, message } from "@/services/api";
import { attachmentResultSchema, attachmentSchema, attachmentType, attachmentTypes } from "@/validations/sop.schema";
import { Feedback, FormField } from "../shared/form-feedback";
import { ResourcePanel, type Field } from "../shared/resource-panel";

const documentFields: Field[] = [
  { key: "document_code", label: "Kode dokumen" }, { key: "title", label: "Judul" },
  { key: "markdown_content", label: "Isi Markdown", type: "textarea", optional: true },
  { key: "area_id", label: "UUID area (opsional)", createOnly: true, optional: true },
];
const documentColumns = [...documentFields.slice(0, 2), { key: "approval_status", label: "Status" }];

export function SopDocuments() {
  return <ResourcePanel title="Dokumen SOP" path="sop-documents" columns={documentColumns} fields={documentFields}
    archiveLabel="Arsipkan" rowAction={(row) => <SopAttachment documentId={String(row.id)} />} />;
}

function SopAttachment({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const form = useForm<z.infer<typeof attachmentSchema>>({ resolver: zodResolver(attachmentSchema) });
  const busy = form.formState.isSubmitting || downloading;
  const path = `sop-documents/${documentId}/attachment`;

  const upload = form.handleSubmit(async ({ attachment }) => {
    setError(""); setNotice("");
    const type = attachmentType(attachment.name);
    if (!type) return;
    try {
      await apiData(path, attachmentResultSchema, { method: "POST", headers: { "content-type": type }, body: attachment });
      setNotice("Lampiran disimpan.");
    } catch (failure) { setError(message(failure)); }
  });

  async function downloadAttachment() {
    setDownloading(true); setError(""); setNotice("");
    try {
      const response = await apiResponse(path);
      const type = response.headers.get("content-type")?.split(";")[0];
      const extension = Object.entries(attachmentTypes).find(([, mime]) => mime === type)?.[0] || "txt";
      await download(response, `lampiran-${documentId}.${extension}`);
    } catch (failure) { setError(message(failure)); }
    finally { setDownloading(false); }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (!busy) { setOpen(next); setError(""); setNotice(""); form.reset(); }
  }}>
    <DialogTrigger render={<Button size="sm" variant="outline" />}>Lampiran</DialogTrigger>
    <DialogContent>
      <DialogTitle className="font-semibold">Lampiran SOP</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">PDF, DOCX, atau TXT hingga 20 MiB.</DialogDescription>
      <form noValidate className="mt-4 space-y-3" onSubmit={upload}>
        <FormField label="File" error={form.formState.errors.attachment?.message}>
          <Controller name="attachment" control={form.control} render={({ field }) => <Input type="file" accept=".pdf,.docx,.txt"
            className="pt-2 file:mr-2" disabled={busy} ref={field.ref} name={field.name} onBlur={field.onBlur}
            onChange={(event) => field.onChange(event.target.files?.[0])} />} />
        </FormField>
        <Feedback error={error} notice={notice} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>Unggah</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void downloadAttachment()}>Unduh lampiran</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
