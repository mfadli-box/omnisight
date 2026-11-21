"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { message, workspaceApi } from "@/services/api";
import { resetConfirmSchema, resetRequestSchema } from "@/validations/auth.schema";
import { Feedback, FormField } from "../shared/form-feedback";

export default function ForgotMfaPanel() {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const email = useForm({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  const token = useForm({ resolver: zodResolver(resetConfirmSchema), defaultValues: { token: "" } });
  const busy = email.formState.isSubmitting || token.formState.isSubmitting;

  async function submit(input: { email: string } | { token: string }) {
    setError("");
    setNotice("");
    try {
      if ("token" in input) {
        await workspaceApi.resetConfirm(input);
        token.reset();
        setNotice("MFA telah direset. Masuk kembali untuk mendaftarkan authenticator.");
      } else {
        await workspaceApi.resetRequest(input);
        email.reset();
        setNotice("Jika akun cocok, instruksi telah dikirim ke email terdaftar.");
      }
    } catch (failure) { setError(message(failure)); }
  }

  return <div className="space-y-5">
    <Link href="/login" className="text-link inline-flex items-center gap-2 text-sm"><ArrowLeft className="size-4" />Kembali ke login</Link>
    <h1 className="font-display text-4xl">Pemulihan MFA</h1>
    <p className="text-sm text-muted">Kirim instruksi ke email akun, lalu pakai token dari email untuk menonaktifkan MFA.</p>
    <form key={String(confirm)} onSubmit={confirm ? token.handleSubmit(submit) : email.handleSubmit(submit)} noValidate className="space-y-4">
      {confirm ? <FormField label="Token dari email" error={token.formState.errors.token?.message}>
        <Input maxLength={512} autoComplete="off" {...token.register("token")} />
      </FormField> : <FormField label="Email akun" error={email.formState.errors.email?.message}>
        <Input type="email" maxLength={320} autoComplete="email" {...email.register("email")} />
      </FormField>}
      <Feedback error={error} notice={notice} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Memproses…" : confirm ? "Konfirmasi reset" : "Kirim instruksi pemulihan"}
      </Button>
    </form>
    <button type="button" className="text-link text-sm" disabled={busy} onClick={() => {
      setConfirm(!confirm); setError(""); setNotice(""); token.reset(); email.reset();
    }}>{confirm ? "Gunakan email" : "Sudah menerima token"}</button>
  </div>;
}
