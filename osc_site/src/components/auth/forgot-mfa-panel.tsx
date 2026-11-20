"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ForgotMfaPanel() {
  const [email, setEmail] = useState(""); const [token, setToken] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/auth/${confirm ? "reset-confirm" : "reset-request"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(confirm ? { token } : { email }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Permintaan belum dapat diproses.");
      setNotice(confirm ? "MFA telah direset. Anda dapat login kembali dan mendaftarkan authenticator baru." : "Jika akun cocok, instruksi pemulihan telah dikirim ke email terdaftar.");
      if (!confirm) setEmail("");
    } catch (err) { setError(err instanceof Error ? err.message : "Permintaan belum dapat diproses."); }
    finally { setBusy(false); }
  }
  return <><Link href="/login" className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-teal-800"><ArrowLeft className="size-3.5" />Kembali ke login</Link><div className="mb-5 grid size-12 place-items-center rounded-2xl bg-teal-50 text-teal-800"><KeyRound className="size-5" /></div><h1 className="font-display text-2xl font-bold tracking-tight">Pemulihan MFA</h1><p className="mt-2 text-sm leading-6 text-slate-500">Kirim instruksi reset ke email akun. Setelah email diterima, masukkan token pemulihan untuk menonaktifkan MFA.</p>
    <form onSubmit={submit} className="mt-7 space-y-4"><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">{confirm ? "Token dari email" : "Email akun"}</span><Input type={confirm ? "text" : "email"} required maxLength={confirm ? 512 : 320} value={confirm ? token : email} onChange={(e) => confirm ? setToken(e.target.value) : setEmail(e.target.value)} placeholder={confirm ? "Tempel token reset" : "nama@perusahaan.com"} autoComplete={confirm ? "off" : "email"} /></label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}{notice && <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm leading-6 text-emerald-800"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{notice}</p>}
      <Button className="w-full" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{confirm ? "Konfirmasi reset" : "Kirim instruksi pemulihan"}{confirm ? <KeyRound className="size-4" /> : <Mail className="size-4" />}</>}</Button>
      <button type="button" onClick={() => { setConfirm(!confirm); setError(""); setNotice(""); }} className="w-full py-1 text-xs font-semibold text-teal-800">{confirm ? "Gunakan email terlebih dahulu" : "Sudah menerima token? Masukkan token"}</button>
    </form>
  </>;
}
