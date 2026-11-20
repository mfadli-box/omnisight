"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "otp" | "backup";
const companies = [
  { id: "10000000-0000-4000-8000-000000000001", label: "OmniSight Demo Company A" },
  { id: "10000000-0000-4000-8000-000000000002", label: "OmniSight Demo Company B" },
];

export default function LoginPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [company, setCompany] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: company === "custom" ? customCompany : company || null, username, password, ...(mode === "backup" ? { backup_code: backupCode } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Login belum berhasil.");
      if (payload.data?.mfa_required) { setMode("otp"); setNotice("Masukkan kode dari aplikasi authenticator."); return; }
      router.replace("/CT01"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Login belum berhasil."); }
    finally { setBusy(false); }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/verify-mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ otp }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Verifikasi belum berhasil.");
      router.replace("/CT01"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Verifikasi belum berhasil."); }
    finally { setBusy(false); }
  }

  const heading = mode === "otp" ? "Konfirmasi identitas" : mode === "backup" ? "Gunakan backup code" : "Selamat datang kembali";
  const subtitle = mode === "otp" ? "Masukkan kode 6 digit dari authenticator untuk melanjutkan." : mode === "backup" ? "Backup code hanya dapat digunakan satu kali dan akan menonaktifkan MFA." : "Masuk untuk melihat status dan mengelola operasi perusahaan.";

  return <>
    <div className="mb-8">
      <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-teal-50 text-teal-800">{mode === "otp" ? <ShieldCheck className="size-5" /> : mode === "backup" ? <KeyRound className="size-5" /> : <LockKeyhole className="size-5" />}</div>
      <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>

    {mode !== "otp" && <form onSubmit={submitLogin} className="space-y-4">
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Company</span><select value={company} onChange={(e) => setCompany(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"><option value="">Local Account</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="custom">Company lain · masukkan ID</option></select></label>
      {company === "custom" && <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Company UUID</span><Input value={customCompany} onChange={(e) => setCustomCompany(e.target.value)} placeholder="UUID dari administrator" maxLength={36} required /></label>}
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Username</span><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" required maxLength={128} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Password</span><div className="relative"><Input className="pr-11" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" required maxLength={1024} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
      {mode === "backup" && <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Backup code</span><Input value={backupCode} onChange={(e) => setBackupCode(e.target.value)} placeholder="Masukkan satu backup code" autoComplete="one-time-code" required maxLength={128} /></label>}
      {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-teal-100 bg-teal-50 px-3.5 py-3 text-sm text-teal-800">{notice}</p>}
      <Button type="submit" className="w-full" disabled={busy || (company === "custom" && customCompany.length !== 36)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{mode === "backup" ? "Verifikasi backup code" : "Masuk ke workspace"}<ArrowRight className="size-4" /></>}</Button>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1"><button type="button" onClick={() => { setMode(mode === "backup" ? "login" : "backup"); setError(""); setNotice(""); }} className="text-xs font-semibold text-teal-800 hover:text-teal-950">{mode === "backup" ? "Kembali ke login" : "Gunakan backup code"}</button><Link href="/forgot-mfa" className="text-xs font-semibold text-slate-500 hover:text-slate-800">Pemulihan MFA</Link></div>
    </form>}

    {mode === "otp" && <form onSubmit={submitOtp} className="space-y-4">
      <label className="block space-y-2"><span className="text-xs font-semibold text-slate-700">Kode verifikasi</span><Input autoFocus className="h-14 text-center font-mono text-xl tracking-[.5em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required /></label>
      {notice && <p role="status" className="rounded-xl border border-teal-100 bg-teal-50 px-3.5 py-3 text-sm text-teal-800">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || otp.length !== 6}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>Verifikasi dan lanjutkan<ArrowRight className="size-4" /></>}</Button>
      <div className="flex justify-between"><button type="button" onClick={() => { setMode("backup"); setError(""); setNotice(""); }} className="text-xs font-semibold text-teal-800">Pakai backup code</button><Link href="/forgot-mfa" className="text-xs font-semibold text-slate-500">Pemulihan MFA</Link><button type="button" onClick={() => { setMode("login"); setOtp(""); setError(""); setNotice(""); }} className="text-xs font-semibold text-slate-500">Kembali</button></div>
    </form>}

    <div className="mt-7 border-t border-slate-100 pt-5 text-center"><p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><Mail className="size-3.5" />Butuh bantuan akses? Hubungi administrator perusahaan.</p></div>
  </>;
}
