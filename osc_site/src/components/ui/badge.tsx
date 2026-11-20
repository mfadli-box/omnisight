import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "good" | "warning" | "danger" | "teal" }) {
  const tones = { neutral: "bg-slate-100 text-slate-600", good: "bg-emerald-50 text-emerald-700", warning: "bg-amber-50 text-amber-700", danger: "bg-rose-50 text-rose-700", teal: "bg-teal-50 text-teal-800" };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[tone], className)} {...props} />;
}
