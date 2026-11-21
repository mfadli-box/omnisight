import { Activity, Aperture, KeyRound, NotebookText } from "lucide-react";
import type { Metadata } from "next";
import LoginPanel from "@/components/features/auth/login-panel";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return <main className="grid min-h-dvh gap-4 p-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.12fr_1fr]">
    <section className="relative hidden min-h-[650px] flex-col justify-between overflow-hidden rounded-2xl bg-[#142d22] p-12 text-[#edf0de] lg:flex xl:p-16">
      <div className="login-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <Brand />
      <div className="relative max-w-xl">
        <p className="font-display text-5xl leading-[1.05] tracking-tight xl:text-7xl">Pusat kendali operasi perusahaan</p>
        <ul className="mt-8 grid max-w-md gap-3 border-t border-white/20 pt-5 text-sm text-[#cbd5bf]">
          <li className="flex items-center gap-3"><Activity className="size-4 text-[#bdde9f]" />Pantau kesehatan node dan agent</li>
          <li className="flex items-center gap-3"><KeyRound className="size-4 text-[#bdde9f]" />Kelola permintaan akses bastion</li>
          <li className="flex items-center gap-3"><NotebookText className="size-4 text-[#bdde9f]" />Temukan SOP dan laporan operasional</li>
        </ul>
      </div>
    </section>
    <section className="flex min-w-0 items-center justify-center py-8 sm:px-8 lg:py-0">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 text-primary lg:hidden"><Brand /></div>
        <Card className="p-6 sm:p-10"><LoginPanel /></Card>
      </div>
    </section>
  </main>;
}

function Brand() {
  return <div className="relative flex items-center gap-3 text-sm font-semibold tracking-wide">
    <span className="grid size-9 place-items-center rounded-lg bg-[#cfdfac] text-[#172e23]"><Aperture className="size-5" /></span>
    OmniSight
  </div>;
}
