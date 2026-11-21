"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { message, workspaceApi } from "@/services/api";
import { backupFormSchema, loginFormSchema, otpFormSchema } from "@/validations/auth.schema";
import type { Company } from "@/validations/tenant.schema";
import { Feedback, FormField } from "../shared/form-feedback";

type Mode = "login" | "otp" | "backup";
type Credentials = z.infer<typeof loginFormSchema>;
const emptyCredentials: Credentials = { company_id: "", username: "", password: "" };

export default function LoginPanel() {
  const [mode, setMode] = useState<Mode>("login");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [directory, setDirectory] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [remembered, setRemembered] = useState<Omit<Credentials, "password">>({ company_id: "", username: "" });
  const [error, setError] = useState("");

  const login = useForm<Credentials>({ resolver: zodResolver(loginFormSchema), defaultValues: emptyCredentials });
  const backup = useForm<z.infer<typeof backupFormSchema>>({
    resolver: zodResolver(backupFormSchema), defaultValues: { ...emptyCredentials, backup_code: "" },
  });
  const otp = useForm<z.infer<typeof otpFormSchema>>({ resolver: zodResolver(otpFormSchema), defaultValues: { otp: "" } });

  useEffect(() => {
    const controller = new AbortController();
    workspaceApi.companies(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setCompanies(items);
      setDirectory("ready");
    }).catch(() => { if (!controller.signal.aborted) setDirectory("error"); });
    return () => controller.abort();
  }, [revision]);

  const current = mode === "backup" ? backup : login;
  const loginCompany = useWatch({ control: login.control, name: "company_id" });
  const backupCompany = useWatch({ control: backup.control, name: "company_id" });
  const usernameField = mode === "backup" ? backup.register("username") : login.register("username");
  const passwordField = mode === "backup" ? backup.register("password") : login.register("password");
  const busy = login.formState.isSubmitting || backup.formState.isSubmitting || otp.formState.isSubmitting;
  const options = [{ value: "", label: "Akun lokal" }, ...companies.map(({ id, name }) => ({ value: id, label: name }))];

  function changeMode(next: Mode) {
    const values = mode === "otp" ? remembered : current.getValues();
    const identity = { company_id: values.company_id, username: values.username };
    login.reset({ ...identity, password: "" });
    backup.reset({ ...identity, password: "", backup_code: "" });
    otp.reset();
    setError("");
    setMode(next);
  }

  async function signIn(values: Credentials & { backup_code?: string }) {
    setError("");
    try {
      const result = await workspaceApi.login({ ...values, company_id: values.company_id || null });
      if (!result.mfa_required) {
        window.location.replace("/");
        return;
      }
      setRemembered({ company_id: values.company_id, username: values.username });
      changeMode("otp");
    } catch (failure) { setError(message(failure)); }
  }

  const submitOtp = otp.handleSubmit(async (values) => {
    setError("");
    try {
      await workspaceApi.verify(values);
      window.location.replace("/");
    } catch (failure) { setError(message(failure)); }
  });

  return <div className="space-y-6">
    <div>
      {mode !== "login" && <div className="mb-3 grid size-10 place-items-center rounded-lg bg-accent text-primary">
        {mode === "otp" ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
      </div>}
      <h1 className="font-display text-4xl tracking-tight">
        {mode === "otp" ? "Verifikasi identitas" : mode === "backup" ? "Gunakan backup code" : "Masuk ke OmniSight"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {mode === "otp" ? "Masukkan kode 6 digit dari aplikasi authenticator."
          : mode === "backup" ? "Backup code dapat dipakai sekali dan akan menonaktifkan MFA."
          : "Gunakan akun perusahaan untuk mengakses workspace."}
      </p>
    </div>
    {mode === "otp" ? <form noValidate onSubmit={submitOtp} className="space-y-4">
      <FormField label="Kode verifikasi" error={otp.formState.errors.otp?.message}>
        <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          className="h-12 font-mono text-lg tracking-[.38em]" aria-invalid={!!otp.formState.errors.otp} {...otp.register("otp")} />
      </FormField>
      <Feedback error={error} />
      <Submit label="Verifikasi dan masuk" busy={busy} />
    </form> : <form key={mode} noValidate onSubmit={mode === "backup" ? backup.handleSubmit(signIn) : login.handleSubmit(signIn)} className="space-y-4">
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Company</span>
        <Select label="Company" options={options} value={mode === "backup" ? backupCompany : loginCompany}
          onChange={(value) => mode === "backup" ? backup.setValue("company_id", value) : login.setValue("company_id", value)} disabled={busy} />
        {directory === "loading" && <p role="status" className="text-xs text-muted">Memuat daftar company…</p>}
        {directory === "error" && <p role="status" className="text-xs text-muted">Daftar company gagal dimuat.{" "}
          <button type="button" className="text-link" onClick={() => { setDirectory("loading"); setRevision(revision + 1); }}>Coba lagi</button>
        </p>}
        {directory === "ready" && !companies.length && <p className="text-xs text-muted">Belum ada company yang tersedia.</p>}
      </div>
      <FormField label="Username" error={current.formState.errors.username?.message}>
        <Input autoComplete="username" maxLength={128} aria-invalid={!!current.formState.errors.username} {...usernameField} />
      </FormField>
      <FormField label="Password" error={current.formState.errors.password?.message}>
        <PasswordInput field={passwordField} invalid={!!current.formState.errors.password} />
      </FormField>
      {mode === "backup" && <FormField label="Backup code" error={backup.formState.errors.backup_code?.message}>
        <Input type="password" autoComplete="one-time-code" maxLength={16}
          aria-invalid={!!backup.formState.errors.backup_code} {...backup.register("backup_code")} />
      </FormField>}
      <Feedback error={error} />
      <Submit label={mode === "backup" ? "Verifikasi backup code" : "Masuk"} busy={busy} />
    </form>}
    <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-xs">
      <button type="button" className="text-link" disabled={busy} onClick={() => changeMode(mode === "backup" ? "login" : "backup")}>
        {mode === "backup" ? "Kembali ke login" : "Gunakan backup code"}
      </button>
      {mode === "otp" && <button type="button" className="text-link" disabled={busy} onClick={() => changeMode("login")}>Kembali ke login</button>}
      <Link className="text-link" href="/forgot-mfa">Pemulihan MFA</Link>
    </div>
  </div>;
}

function PasswordInput({ field, invalid }: { field: UseFormRegisterReturn; invalid: boolean }) {
  const [visible, setVisible] = useState(false);
  return <span className="relative block">
    <Input type={visible ? "text" : "password"} autoComplete="current-password" maxLength={1024}
      className="pr-11" aria-invalid={invalid} {...field} />
    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-0.5"
      aria-label={visible ? "Sembunyikan password" : "Tampilkan password"} onClick={() => setVisible(!visible)}>
      {visible ? <EyeOff /> : <Eye />}
    </Button>
  </span>;
}

function Submit({ label, busy }: { label: string; busy: boolean }) {
  return <Button type="submit" className="w-full justify-between" disabled={busy}>
    {busy ? "Memproses…" : label}{busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
  </Button>;
}
