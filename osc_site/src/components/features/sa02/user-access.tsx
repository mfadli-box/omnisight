"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { z } from "zod";
import { apiData, message } from "@/services/api";
import type { DataRow } from "@/validations/resource.schema";
import { Feedback } from "../shared/form-feedback";
import { ResourcePanel, type Field } from "../shared/resource-panel";

const userFields: Field[] = [
  { key: "username", label: "Username", createOnly: true, max: 128 },
  { key: "full_name", label: "Nama lengkap", max: 200 },
  { key: "email", label: "Email", type: "email", optional: true, max: 320 },
  { key: "password", label: "Password awal", type: "password", createOnly: true, min: 12, max: 1024 },
  { key: "role_id", label: "UUID role", createOnly: true },
  { key: "area_id", label: "UUID area (opsional)", createOnly: true, optional: true },
];

export function UserAccess() {
  return <ResourcePanel title="Akun pengguna" path="users" columns={userFields.slice(0, 3)} fields={userFields}
    archiveLabel="Cabut akses" rowAction={(row) => <ResetMfa row={row} />} />;
}

function ResetMfa({ row }: { row: DataRow }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reset() {
    setBusy(true);
    setError("");
    try {
      await apiData(`users/${row.id}/mfa/reset`, z.object({ reset: z.literal(true) }), { method: "POST" });
      setNotice("MFA pengguna telah direset.");
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
    <DialogTrigger render={<Button size="sm" variant="outline" />}>Reset MFA</DialogTrigger>
    <DialogContent className="space-y-4">
      <DialogTitle className="font-semibold">Reset MFA pengguna</DialogTitle>
      <DialogDescription className="text-sm text-muted">Reset faktor autentikasi dan akhiri sesi aktif untuk {String(row.username)}.</DialogDescription>
      <Feedback error={error} notice={notice} />
      {!notice && <Button variant="danger" disabled={busy} onClick={() => void reset()}>{busy ? "Memproses…" : "Konfirmasi reset"}</Button>}
    </DialogContent>
  </Dialog>;
}

