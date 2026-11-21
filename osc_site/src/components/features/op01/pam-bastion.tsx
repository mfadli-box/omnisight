"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiData, jsonRequest, message } from "@/services/api";
import { pamFormSchema, pamProtocolSchema, pamSessionSchema } from "@/validations/pam.schema";
import { Feedback, FormField } from "../shared/form-feedback";
import { ResourcePanel, type Field } from "../shared/resource-panel";
import { WebTerminal } from "./web-terminal";

const columns: Field[] = [
  { key: "display_name", label: "Nama target" }, { key: "target_code", label: "Kode" },
  { key: "hostname", label: "Host" }, { key: "port", label: "Port", type: "number", min: 1, max: 65535 },
  { key: "protocol", label: "Protokol", choices: pamProtocolSchema.options },
];
const fields: Field[] = [
  ...columns, { key: "area_id", label: "UUID area (opsional)", createOnly: true, optional: true },
];

export function PamBastion() {
  return <div className="space-y-4"><ResourcePanel title="Target bastion" path="pam/targets" columns={columns} fields={fields}
    archiveLabel="Nonaktifkan" rowAction={(row) => <PamSession targetId={String(row.id)} />} /><WebTerminal /></div>;
}

function PamSession({ targetId }: { targetId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<z.infer<typeof pamSessionSchema> | null>(null);
  const form = useForm<z.infer<typeof pamFormSchema>>({
    resolver: zodResolver(pamFormSchema), defaultValues: { reason: "", otp: "" },
  });
  const busy = form.formState.isSubmitting;
  const submit = form.handleSubmit(async ({ reason, otp }) => {
    setError("");
    try {
      setResult(await apiData("pam/sessions/authorize", pamSessionSchema, jsonRequest("POST", {
        target_id: targetId, reason, otp: otp || undefined,
      })));
      form.reset();
    } catch (failure) { setError(message(failure)); }
  });
  return <Dialog open={open} onOpenChange={(next) => {
    if (!busy) { setOpen(next); form.reset(); setResult(null); setError(""); }
  }}>
    <DialogTrigger render={<Button size="sm" variant="outline" />}>Minta akses</DialogTrigger>
    <DialogContent>
      <DialogTitle className="font-semibold">Otorisasi sesi PAM</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">Sertakan alasan akses dan OTP jika diminta.</DialogDescription>
      {result ? <div role="status" className="mt-4 space-y-2 break-all text-sm">
        <p>Status {result.state}</p><p>ID sesi {result.session_id}</p><p>Berlaku hingga {result.expires_at}</p>
      </div> : <form noValidate className="mt-4 space-y-3" onSubmit={submit}>
        <FormField label="Alasan akses" error={form.formState.errors.reason?.message}>
          <Input maxLength={1000} disabled={busy} {...form.register("reason")} />
        </FormField>
        <FormField label="OTP 6 digit" error={form.formState.errors.otp?.message}>
          <Input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy} {...form.register("otp")} />
        </FormField>
        <Feedback error={error} />
        <Button type="submit" disabled={busy}>{busy ? "Memproses…" : "Otorisasi"}</Button>
      </form>}
    </DialogContent>
  </Dialog>;
}
