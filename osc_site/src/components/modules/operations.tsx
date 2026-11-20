"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiData, apiResponse, download, jsonRequest, message } from "@/lib/workspace/api";
import { Feedback, ResourcePanel, selectClass, type Field } from "./resource-panel";

const nodeColumns: Field[] = [
  { key: "node_code", label: "Node" }, { key: "hostname", label: "Hostname" },
  { key: "os_type", label: "Sistem operasi" }, { key: "status", label: "Status" },
  { key: "last_seen_at", label: "Heartbeat terakhir (UTC)" }, { key: "agent_version", label: "Versi agent" },
];

const heartbeatColumns: Field[] = [
  { key: "heartbeat_at", label: "Heartbeat terbaru (UTC)" },
  { key: "cpu_percent", label: "CPU (%)" }, { key: "ram_percent", label: "RAM (%)" },
  { key: "disk_percent", label: "Disk (%)" },
];

export function AgentStatus({ path, title }: { path: string; title: string }) {
  const telemetry = path === "agents/status";
  const [status, setStatus] = useState("");
  return <>
    <Card><CardContent className="p-4">
      <label className="block max-w-xs space-y-1 text-sm font-medium">Filter status pada halaman
        <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Semua status</option>
          <option value="ONLINE">Online</option>
          <option value="STALE">Stale</option>
          <option value="PENDING">Pending</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </label>
      {telemetry && <p className="mt-3 text-sm text-slate-600">Metrik heartbeat tersedia selama 15 menit setelah diterima. API scheduler belum tersedia.</p>}
    </CardContent></Card>
    <ResourcePanel readOnly title={title} path={path} columns={telemetry ? [...nodeColumns, ...heartbeatColumns] : nodeColumns}
      filter={status ? (row) => row.status === status : undefined}
      emptyMessage={status ? "Tidak ada node dengan status ini pada halaman aktif." : undefined} />
  </>;
}

export function PamSession({ targetId }: { targetId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ session_id: string; state: string; expires_at: string } | null>(null);

  async function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const otp = String(fields.get("otp") || "");
    setBusy(true);
    setError("");
    try {
      setResult(await apiData("pam/sessions/authorize", jsonRequest("POST", {
        target_id: targetId,
        requested_reason: String(fields.get("reason") || "").trim(),
        ...(otp && { otp }),
      })));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    setOpen(next);
    if (next) { setResult(null); setError(""); }
  }}>
    <DialogTrigger asChild><Button size="sm" variant="outline">Minta akses</Button></DialogTrigger>
    <DialogContent>
      <DialogTitle className="font-semibold">Otorisasi sesi PAM</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-slate-600">Sertakan alasan akses dan OTP jika diminta.</DialogDescription>
      {result ? <div role="status" className="mt-4 space-y-2 break-all text-sm">
        <p>Status {result.state}</p><p>ID sesi {result.session_id}</p><p>Berlaku hingga {result.expires_at}</p>
      </div> : <form className="mt-4 space-y-3" onSubmit={authorize}>
        <label className="block space-y-1 text-sm">Alasan akses<Input name="reason" required maxLength={1024} disabled={busy} /></label>
        <label className="block space-y-1 text-sm">OTP 6 digit<Input name="otp" type="password" inputMode="numeric"
          autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} disabled={busy} /></label>
        <Feedback error={error} />
        <Button disabled={busy}>{busy ? "Memproses…" : "Otorisasi"}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}

export function SopAttachment({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const path = `sop-documents/${documentId}/attachment`;

  async function transfer(file?: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (file) {
        if (file.size < 1 || file.size > 20 * 1024 * 1024) throw new Error("Ukuran file harus antara 1 byte dan 20 MiB.");
        const types = {
          pdf: "application/pdf", txt: "text/plain",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
        const extension = file.name.split(".").pop()?.toLowerCase() as keyof typeof types;
        if (!Object.hasOwn(types, extension)) throw new Error("Pilih file PDF, DOCX, atau TXT.");
        await apiData(path, { method: "POST", headers: { "content-type": types[extension] }, body: file });
        setNotice("Lampiran disimpan.");
      } else {
        const response = await apiResponse(path);
        const type = response.headers.get("content-type");
        const extension = type?.includes("pdf") ? "pdf" : type?.includes("wordprocessingml") ? "docx" : "txt";
        await download(response, `lampiran-${documentId}.${extension}`);
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    setOpen(next);
    setError("");
    setNotice("");
  }}>
    <DialogTrigger asChild><Button size="sm" variant="outline">Lampiran</Button></DialogTrigger>
    <DialogContent>
      <DialogTitle className="font-semibold">Lampiran SOP</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-slate-600">PDF, DOCX, atau TXT hingga 20 MiB.</DialogDescription>
      <form className="mt-4 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        const file = new FormData(event.currentTarget).get("attachment");
        if (file instanceof File) void transfer(file);
      }}>
        <label className="block space-y-1 text-sm">File<Input name="attachment" type="file" accept=".pdf,.docx,.txt"
          required disabled={busy} /></label>
        <Feedback error={error} notice={notice} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>Unggah</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void transfer()}>Unduh lampiran</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

const reportTables = [
  ["osc_agent_node", "Node agent"], ["osc_sop_document", "Dokumen SOP"],
  ["osc_pam_session", "Sesi PAM"], ["osc_activity_log", "Log aktivitas"],
];

export function ReportPanel({ format }: { format: "xlsx" | "pdf" }) {
  const [table, setTable] = useState(reportTables[0][0]);
  const [archiveId, setArchiveId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isPdf = format === "pdf";

  async function run(path: string, init?: RequestInit) {
    setBusy(true);
    setError("");
    try {
      const response = await apiResponse(path, init);
      const id = response.headers.get("x-report-archive-id");
      if (id) setArchiveId(id);
      await download(response, `omnisight-${table}.${format}`);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  return <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>{isPdf ? "Buat laporan PDF" : "Ekspor workbook Excel"}</CardTitle>
      <CardDescription>Data dibatasi pada company dan area aktif. Hasil disimpan sebagai arsip privat.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <label className="block space-y-1 text-sm font-medium">Sumber data
        <select className={selectClass} value={table} disabled={busy} onChange={(event) => { setTable(event.target.value); setArchiveId(""); }}>
          {reportTables.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <Feedback error={error} notice={archiveId ? "Laporan tersedia untuk diunduh ulang." : undefined} />
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => {
          setArchiveId("");
          void (isPdf ? run("reports/generate-pdf", jsonRequest("POST", { table_name: table }))
            : run(`reports/export-excel/${table}`));
        }}>{busy ? "Memproses…" : `Buat dan unduh ${format.toUpperCase()}`}</Button>
        {archiveId && <Button disabled={busy} variant="outline" onClick={() => void run(`reports/archives/${archiveId}`)}>Unduh ulang</Button>}
      </div>
    </CardContent>
  </Card>;
}
