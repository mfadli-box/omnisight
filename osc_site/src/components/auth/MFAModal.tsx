"use client";

import { useEffect, useRef, useState } from "react";
import { otpSchema } from "@/validations/auth.schema";

type Props = {
  onVerify: (otp: string) => Promise<void>;
  onCancel: () => void;
};

export function MFAModal({ onVerify, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-labelledby="mfa-title" onCancel={e => {
    e.preventDefault();
    if (!busy) onCancel();
  }} className="w-[min(24rem,90vw)] rounded-xl p-6 shadow-xl backdrop:bg-slate-900/50">
    <h2 id="mfa-title" className="section-title">Verifikasi dua langkah</h2>
    <p className="my-3 text-sm text-slate-600">Masukkan enam digit dari aplikasi autentikator Anda.</p>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault();
      if (busy || !otpSchema.safeParse({ otp }).success) return;
      setBusy(true);
      setError("");
      try { await onVerify(otp); }
      catch (err) { setError(err instanceof Error ? err.message : "Verifikasi gagal."); }
      finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor="otp">Kode verifikasi</label>
        <input id="otp" className="field font-mono tracking-[0.35em]" autoFocus autoComplete="one-time-code"
          inputMode="numeric" maxLength={6} value={otp} disabled={busy}
          onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ""))} /></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="primary" disabled={busy || otp.length !== 6}>{busy ? "Memverifikasi…" : "Verifikasi"}</button>
      <button className="w-full py-2" type="button" disabled={busy} onClick={onCancel}>Kembali ke login</button>
    </form>
  </dialog>;
}
