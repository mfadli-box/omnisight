import type { ReactNode } from "react";

export function Feedback({ error, notice }: { error?: string; notice?: string }) {
  return <>
    {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-accent px-3 py-2.5 text-sm text-foreground">{notice}</p>}
  </>;
}

export function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <div className="space-y-1.5 text-sm">
    <label className="block space-y-1.5 font-medium"><span>{label}</span>{children}</label>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
