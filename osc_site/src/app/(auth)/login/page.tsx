"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MFAModal } from "@/components/auth/MFAModal";
import { useTenant } from "@/components/auth/TenantContext";
import { SearchableCombobox } from "@/components/cm/SearchableCombobox";
import { authenticate, loadCompanies } from "@/services/auth";
import { loginSchema, type Login, type Company } from "@/validations/auth.schema";

export default function LoginPage() {
  const { setTenant } = useTenant();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [lookup, setLookup] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [success, setSuccess] = useState<Company | null>(null);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState("");
  const { register, watch, setValue, resetField, handleSubmit, formState: { isSubmitting, errors } } =
    useForm<Login>({ resolver: zodResolver(loginSchema), defaultValues: { company_id: "", username: "", password: "" } });
  const companyId = watch("company_id");
  const company = companies.find(c => c.id === companyId) ?? null;
  useEffect(() => {
    const controller = new AbortController();
    setLookup("loading");
    loadCompanies(controller.signal).then(items => {
      if (!controller.signal.aborted) { setCompanies(items); setLookup("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setLookup("error"); });
    return () => controller.abort();
  }, [attempt]);

  function finish(selected: Company, recovery: boolean) {
    setTenant(selected);
    setPending(null);
    setSuccess(selected);
    setWarning(recovery);
  }

  return <main className="grid min-h-screen place-items-center px-4 py-8">
    <section className="panel w-full max-w-md shadow-sm">
      <p className="mb-5 font-semibold text-teal-800">OmniSight</p>
      <h1 className="mb-6 text-2xl font-semibold">{success ? "Berhasil masuk" : "Masuk"}</h1>
      {success ? <p>Perusahaan aktif · {success.label}</p> : <form className="space-y-4" onSubmit={handleSubmit(async values => {
        if (!company || isSubmitting || pending) return;
        setError("");
        try {
          const result = await authenticate(values);
          resetField("password");
          if (result.mfa_required) setPending(result.attempt_id);
          else finish(company, result.warning_flag);
        } catch (err) { setError(err instanceof Error ? err.message : "Login gagal."); }
      })}>
        <div><SearchableCombobox label="Perusahaan" options={companies} value={company}
          disabled={isSubmitting || lookup !== "ready" || !companies.length}
          onChange={c => setValue("company_id", c?.id ?? "")} />
          {lookup === "loading" && <p role="status">Memuat perusahaan…</p>}
          {lookup === "error" && <p role="alert">Daftar perusahaan gagal dimuat. <button type="button"
            className="underline" onClick={() => setAttempt(n => n + 1)}>Coba lagi</button></p>}
          {lookup === "ready" && !companies.length && <p role="status">Belum ada perusahaan aktif.</p>}
        </div>
        <div><label className="label" htmlFor="username">Nama pengguna</label>
          <input className="field" id="username" autoComplete="username" maxLength={200} required {...register("username")} />
          {errors.username && <p role="alert">Masukkan nama pengguna.</p>}</div>
        <div><label className="label" htmlFor="password">Kata sandi</label>
          <input className="field" id="password" type="password" autoComplete="current-password" required {...register("password")} /></div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="primary" disabled={!company || isSubmitting || !!pending}>{isSubmitting ? "Memproses…" : "Masuk"}</button>
      </form>}
    </section>
    {pending && company && <MFAModal onCancel={() => setPending(null)} onVerify={async otp => {
      const result = await authenticate({ otp, attempt_id: pending });
      finish(company, result.warning_flag);
    }} />}
    {warning && <aside role="status" className="fixed inset-x-4 bottom-4 mx-auto flex max-w-md items-center gap-4 rounded-lg bg-slate-900 p-4 text-sm text-white shadow-lg">
      HRIS bermasalah. Anda masuk via Mode Pemulihan.
      <button type="button" aria-label="Tutup pemberitahuan" className="p-2" onClick={() => setWarning(false)}>×</button>
    </aside>}
  </main>;
}
