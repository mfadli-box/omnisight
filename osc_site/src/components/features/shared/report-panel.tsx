"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { apiResponse, download, jsonRequest, message } from "@/services/api";
import { reportSchema, reportTables } from "@/validations/report.schema";
import { idSchema } from "@/validations/tenant.schema";
import { Feedback } from "./form-feedback";

type Source = z.infer<typeof reportSchema>["table_name"];
const options = Object.entries(reportTables).map(([value, label]) => ({ value, label }));

export function ReportPanel({ format }: { format: "xlsx" | "pdf" }) {
  const [archive, setArchive] = useState<{ id: string; source: Source } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const isPdf = format === "pdf";
  const form = useForm<z.infer<typeof reportSchema>>({
    resolver: zodResolver(reportSchema), defaultValues: { table_name: "osc_agent_node" },
  });
  const busy = form.formState.isSubmitting || downloading;

  async function run(source: Source, path: string, init?: RequestInit) {
    setError("");
    try {
      const response = await apiResponse(path, init);
      const result = idSchema.safeParse(response.headers.get("x-report-archive-id"));
      if (result.success) setArchive({ id: result.data, source });
      await download(response, `omnisight-${source}.${format}`);
    } catch (failure) { setError(message(failure)); }
  }

  const submit = form.handleSubmit(async (input) => {
    setArchive(null);
    await (isPdf ? run(input.table_name, "reports/generate-pdf", jsonRequest("POST", input))
      : run(input.table_name, `reports/export-excel/${input.table_name}`));
  });

  return <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>{isPdf ? "Buat laporan PDF" : "Ekspor workbook Excel"}</CardTitle>
      <CardDescription>Arsip laporan tersedia dalam cakupan company dan area aktif.</CardDescription>
    </CardHeader>
    <CardContent>
      <form noValidate onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Sumber data</p>
          <Controller name="table_name" control={form.control} render={({ field, fieldState }) => <>
            <Select label="Sumber data" options={options} value={field.value} onChange={(value) => {
              field.onChange(value); setArchive(null);
            }} onBlur={field.onBlur} triggerRef={field.ref} disabled={busy} invalid={!!fieldState.error} />
            {fieldState.error && <p role="alert" className="text-sm text-danger">Pilih sumber data yang tersedia.</p>}
          </>} />
        </div>
        <Feedback error={error} notice={archive ? "Laporan tersedia untuk diunduh ulang." : undefined} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}><Download />{busy ? "Memproses…" : `Buat dan unduh ${format.toUpperCase()}`}</Button>
          {archive && <Button type="button" disabled={busy} variant="outline" onClick={async () => {
            setDownloading(true);
            try { await run(archive.source, `reports/archives/${archive.id}`); }
            finally { setDownloading(false); }
          }}>Unduh ulang</Button>}
        </div>
      </form>
    </CardContent>
  </Card>;
}
