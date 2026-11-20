"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { apiData, type Company } from "@/lib/workspace/api";

type Mode = "login" | "otp" | "backup";
export default function LoginPanel() {
  const [mode, setMode] = useState<Mode>("login");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyStatus, setCompanyStatus] = useState("Memuat daftar company…");
  const [companyRetry, setCompanyRetry] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    apiData<Company[]>("public/companies", { signal: controller.signal })
      .then((items) => {
        setCompanies(items);
        setCompanyStatus(items.length ? "" : "Belum ada company yang tersedia.");
      })
      .catch(() => {
        if (!controller.signal.aborted) setCompanyStatus("Daftar company gagal dimuat.");
      });
    return () => controller.abort();
  }, [companyRetry]);

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: company || null, username, password, ...(mode === "backup" ? { backup_code: backupCode } : {}) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Login belum berhasil.");
      if (payload.data?.mfa_required) { setPassword(""); setBackupCode(""); setMode("otp"); return; }
      window.location.replace("/");
    } catch (err) { setError(err instanceof Error ? err.message : "Login belum berhasil."); }
    finally { setBusy(false); }
  }

  async function submitOtp(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/mfa-verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ otp }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Verifikasi belum berhasil.");
      window.location.replace("/");
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
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Company</span><select value={company} onChange={(e) => setCompany(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"><option value="">Local Account</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {companyStatus && <div className="flex items-center gap-2 text-xs text-slate-600">
        <span role="status">{companyStatus}</span>
        {companyStatus === "Daftar company gagal dimuat." && <button type="button" className="font-semibold text-teal-800" onClick={() => { setCompanyStatus("Memuat daftar company…"); setCompanyRetry((count) => count + 1); }}>Coba lagi</button>}
      </div>}
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Username</span><Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" required maxLength={128} /></label>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Password</span><div className="relative"><Input className="pr-11" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" required maxLength={1024} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></label>
      {mode === "backup" && <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Backup code</span><Input value={backupCode} onChange={(e) => setBackupCode(e.target.value)} type="password" placeholder="Masukkan satu backup code" autoComplete="one-time-code" required maxLength={128} /></label>}
      {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>{mode === "backup" ? "Verifikasi backup code" : "Masuk ke workspace"}<ArrowRight className="size-4" /></>}</Button>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1"><button type="button" disabled={busy} onClick={() => { setMode(mode === "backup" ? "login" : "backup"); setError(""); }} className="text-xs font-semibold text-teal-800 hover:text-teal-950">{mode === "backup" ? "Kembali ke login" : "Gunakan backup code"}</button><Link href="/forgot-mfa" className="text-xs font-semibold text-slate-500 hover:text-slate-800">Pemulihan MFA</Link></div>
    </form>}

    {mode === "otp" && <form onSubmit={submitOtp} className="space-y-4">
      <label className="block space-y-2"><span className="text-xs font-semibold text-slate-700">Kode verifikasi</span><Input autoFocus className="h-14 text-center font-mono text-xl tracking-[.5em]" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" required /></label>
      {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || otp.length !== 6}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <>Verifikasi dan lanjutkan<ArrowRight className="size-4" /></>}</Button>
      <div className="flex justify-between"><button type="button" disabled={busy} onClick={() => { setMode("backup"); setError(""); }} className="text-xs font-semibold text-teal-800">Pakai backup code</button><Link href="/forgot-mfa" className="text-xs font-semibold text-slate-500">Pemulihan MFA</Link><button type="button" disabled={busy} onClick={() => { setMode("login"); setOtp(""); setError(""); }} className="text-xs font-semibold text-slate-500">Kembali</button></div>
    </form>}

    <div className="mt-7 border-t border-slate-100 pt-5 text-center"><p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><Mail className="size-3.5" />Butuh bantuan akses? Hubungi administrator perusahaan.</p></div>
  </>;
}
