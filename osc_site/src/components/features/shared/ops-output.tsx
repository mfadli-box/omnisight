"use client";

import { useEffect, useRef } from "react";

export function OpsOutput({ text, label }: { text: string; label: string }) {
  const panel = useRef<HTMLPreElement>(null);
  useEffect(() => { if (panel.current) panel.current.scrollTop = panel.current.scrollHeight; }, [text]);
  return <pre ref={panel} role="log" aria-label={label} tabIndex={0}
    className="max-h-64 min-h-24 overflow-auto whitespace-pre-wrap wrap-anywhere rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
    {text || "Belum ada output."}
  </pre>;
}

export function opsStatus(status: "succeeded" | "failed" | "expired") {
  if (status === "expired") return "Waktu tunggu operasi habis.";
  return status === "succeeded" ? "Operasi selesai." : "Operasi gagal. Periksa output.";
}
