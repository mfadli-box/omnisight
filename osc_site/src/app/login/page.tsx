import type { Metadata } from "next";
import LoginPanel from "@/components/auth/login-panel";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return <main className="relative min-h-screen overflow-hidden bg-[#edf3f1] px-4 py-8 sm:px-8 sm:py-12">
    <div className="soft-grid pointer-events-none absolute inset-0 opacity-40" />
    <div className="pointer-events-none absolute -right-28 -top-28 size-[30rem] rounded-full bg-teal-200/35 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-44 -left-36 size-[30rem] rounded-full bg-blue-100/70 blur-3xl" />
    <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_32px_100px_-50px_rgba(15,45,50,.5)] lg:grid-cols-[1.02fr_.98fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#122c30] p-10 text-white lg:flex xl:p-14">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #9ecbc0 1px, transparent 0)", backgroundSize: "24px 24px" }} />
        <div className="absolute -right-24 top-24 size-96 rounded-full border border-teal-100/15" />
        <div className="absolute -right-10 top-40 size-64 rounded-full border border-teal-100/15" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-teal-300 text-teal-950"><span className="text-lg font-black">O</span></div>
          <div><div className="font-display text-lg font-bold tracking-tight">OmniSight</div><div className="text-[10px] font-semibold uppercase tracking-[.22em] text-teal-100/65">Operations intelligence</div></div>
        </div>
        <div className="relative z-10 max-w-lg pb-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-200/20 bg-teal-200/10 px-3 py-1.5 text-xs font-semibold text-teal-100"><span className="size-1.5 rounded-full bg-emerald-300" />Secure operations workspace</div>
          <h1 className="font-display text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">Satu pandangan untuk operasi yang lebih <span className="text-teal-200">terkendali.</span></h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">Pantau kesehatan store dan agent, amankan akses bastion, dan kelola prosedur operasional dalam satu ruang kerja.</p>
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[{ value: "24/7", label: "Visibility" }, { value: "MFA", label: "Protected access" }, { value: "RLS", label: "Tenant boundary" }].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="font-display text-xl font-bold">{item.value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{item.label}</div></div>)}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400"><span>OmniSight · Internal platform</span><span>DevSecOps workspace</span></div>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-12 lg:px-14">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-xl bg-teal-800 text-white"><span className="font-black">O</span></div><span className="font-display text-lg font-bold">OmniSight</span></div>
          <LoginPanel />
          <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-500" />Sesi dilindungi dengan enkripsi dan kontrol akses tenant</div>
        </div>
      </section>
    </div>
  </main>;
}
