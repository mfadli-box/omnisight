"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, ArrowRightLeft, Bell, BookOpenText, Building2, ChevronDown, CircleHelp, Command, Database,
  FileBarChart2, Gauge, KeyRound, LayoutDashboard, LoaderCircle, LogOut, Menu, MonitorCog, Network, PanelLeftClose,
  Search, Shield, ShieldCheck, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NavigationProvider, type NavigationItem, type WorkspaceContext } from "@/components/workspace/navigation-context";

const moduleIcons: Record<string, typeof LayoutDashboard> = {
  CT01: Gauge, OP01: KeyRound, OP02: MonitorCog, KB01: BookOpenText, RP01: Database, RP02: FileBarChart2,
  SA01: Building2, SA02: Users, SA03: ShieldCheck, SA04: Network,
};
const companies = [
  { id: "10000000-0000-4000-8000-000000000001", name: "OmniSight Demo Company A", areas: [{ id: "20000000-0000-4000-8000-000000000001", label: "Regional 1" }, { id: "20000000-0000-4000-8000-000000000002", label: "Regional 2" }] },
  { id: "10000000-0000-4000-8000-000000000002", name: "OmniSight Demo Company B", areas: [{ id: "20000000-0000-4000-8000-000000000003", label: "Regional 1" }, { id: "20000000-0000-4000-8000-000000000004", label: "Regional 2" }] },
];

export default function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter(); const pathname = usePathname();
  const [items, setItems] = useState<NavigationItem[]>([]); const [context, setContext] = useState<WorkspaceContext>({});
  const [loading, setLoading] = useState(true); const [navError, setNavError] = useState("");
  const [collapsed, setCollapsed] = useState(false); const [drawerOpen, setDrawerOpen] = useState(false);
  const [companyId, setCompanyId] = useState(""); const [areaId, setAreaId] = useState(""); const [switchBusy, setSwitchBusy] = useState(false); const [switchError, setSwitchError] = useState(""); const [switchOpen, setSwitchOpen] = useState(false);
  const [customCompanyId, setCustomCompanyId] = useState(""); const [customAreaId, setCustomAreaId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setNavError("");
    try {
      const response = await fetch("/api/me/navigation", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login"); return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Navigasi tidak dapat dimuat.");
      setItems(Array.isArray(payload.data) ? payload.data : []);
      const nextContext = payload.context || {};
      setContext(nextContext);
      if (typeof nextContext.company_id === "string") setCompanyId(nextContext.company_id);
      setAreaId(typeof nextContext.area_id === "string" ? nextContext.area_id : "");
    } catch (error) { setNavError(error instanceof Error ? error.message : "Navigasi tidak dapat dimuat."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void refresh(); }, [refresh]);
  const moduleCode = pathname.split("/")[1] || "CT01";
  const activeItem = items.find((item) => item.module_code === moduleCode);
  const activeCompany = companies.find((company) => company.id === (context.company_id || companyId));
  const activeAreaId = context.area_id || areaId;
  const regionalLabel = activeCompany?.areas.find((area) => area.id === activeAreaId)?.label || (activeAreaId ? `Regional ${activeAreaId.slice(0, 8)}` : "Semua regional");
  const grouped = useMemo(() => groupItems(items), [items]);
  const resolvedCompanyId = companyId === "custom" ? customCompanyId.trim() : companyId;
  const resolvedAreaId = areaId === "custom" ? customAreaId.trim() : areaId;
  const areasForCompany = companies.find((company) => company.id === resolvedCompanyId)?.areas || [];

  async function switchContext(event: FormEvent) {
    event.preventDefault(); setSwitchBusy(true); setSwitchError("");
    try {
      const response = await fetch("/api/auth/switch-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: resolvedCompanyId, area_id: resolvedAreaId || null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Konteks tidak dapat diganti.");
      setSwitchOpen(false); await refresh(); router.refresh();
    } catch (error) { setSwitchError(error instanceof Error ? error.message : "Konteks tidak dapat diganti."); }
    finally { setSwitchBusy(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login"); router.refresh();
  }

  return <NavigationProvider value={{ items, context, refresh, loading }}>
    <div className="min-h-screen bg-[#f4f6f8]">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-[#142b30] text-white transition-all duration-200 lg:flex ${collapsed ? "w-[82px]" : "w-[264px]"}`}>
        <SidebarBrand collapsed={collapsed} />
        <div className="mx-4 mt-5 rounded-2xl border border-white/[.08] bg-white/[.04] p-3">
          <div className="flex items-center justify-between"><span className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</span><span className="size-1.5 rounded-full bg-emerald-400" /></div>
          {!collapsed && <><div className="mt-2 truncate text-xs font-semibold text-slate-100">{activeCompany?.name || "Pilih company"}</div><div className="mt-1 truncate text-[10px] text-slate-400">{regionalLabel} · Production</div></>}
        </div>
        <nav className="mt-6 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navigasi utama">
          {loading ? <NavLoading collapsed={collapsed} /> : navError ? <div className="mx-2 rounded-xl border border-rose-300/10 bg-rose-300/5 p-3 text-xs leading-5 text-rose-100">{collapsed ? "!" : navError}</div> : grouped.map((group) => <div key={group.code} className="mb-5">
            {!collapsed && <div className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">{group.name}</div>}
            <div className="space-y-1">{group.items.map((item) => <NavigationLink key={item.module_code} item={item} active={moduleCode === item.module_code} collapsed={collapsed} />)}</div>
          </div>)}
          {!loading && !navError && items.length === 0 && <div className="px-3 text-xs leading-5 text-slate-400">Belum ada modul dengan akses view.</div>}
        </nav>
        {!collapsed && <div className="mx-4 mb-4 rounded-2xl bg-teal-950/50 p-3.5"><div className="flex items-center gap-2 text-xs font-semibold"><Shield className="size-3.5 text-teal-300" />Security posture</div><p className="mt-2 text-[10px] leading-4 text-slate-400">RLS aktif · sesi terlindungi · audit berjalan</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[88%] rounded-full bg-teal-300" /></div></div>}
        <button onClick={() => setCollapsed(!collapsed)} className="m-3 flex h-10 items-center justify-center gap-3 rounded-xl text-slate-400 transition hover:bg-white/[.06] hover:text-white" aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}>{collapsed ? <PanelLeftClose className="size-4 rotate-180" /> : <><PanelLeftClose className="size-4"/><span className="text-xs">Ciutkan menu</span></>}</button>
      </aside>

      <div className={`min-h-screen transition-[padding] duration-200 ${collapsed ? "lg:pl-[82px]" : "lg:pl-[264px]"}`}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="flex h-[72px] items-center gap-3 px-4 sm:px-7 lg:px-8">
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}><SheetTrigger asChild><button className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 lg:hidden" aria-label="Buka navigasi"><Menu className="size-4" /></button></SheetTrigger><SheetContent><SidebarBrand collapsed={false} /><div className="px-3 pt-6"><nav aria-label="Navigasi mobile">{loading ? <NavLoading collapsed={false} /> : grouped.map((group) => <div key={group.code} className="mb-5"><div className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">{group.name}</div>{group.items.map((item) => <SheetClose asChild key={item.module_code}><NavigationLink item={item} active={moduleCode === item.module_code} collapsed={false} onNavigate={() => setDrawerOpen(false)} /></SheetClose>)}</div>)}</nav></div></SheetContent></Sheet>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400"><span>OmniSight</span><span>/</span><span className="truncate text-teal-800">{activeItem?.module_code || "Workspace"}</span></div><div className="mt-1 truncate font-display text-sm font-bold text-slate-900 sm:text-base">{activeItem?.module_name || "Operations workspace"}</div></div>
            <div className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 xl:flex"><Search className="size-3.5"/><span>Cari store, agent, atau SOP</span><kbd className="ml-5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px]">⌘ K</kbd></div>
            <Dialog open={switchOpen} onOpenChange={(open) => { setSwitchOpen(open); setSwitchError(""); }}><DialogTrigger asChild><button className="flex max-w-[190px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition hover:border-teal-300 sm:px-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-800"><Building2 className="size-4"/></span><span className="hidden min-w-0 sm:block"><span className="block truncate text-[10px] font-bold text-slate-800">{activeCompany?.name || "Pilih company"}</span><span className="mt-0.5 block truncate text-[9px] text-slate-400">{regionalLabel}</span></span><ChevronDown className="hidden size-3.5 text-slate-400 sm:block"/></button></DialogTrigger>
              <DialogContent><DialogTitle className="font-display text-lg font-bold">Ganti konteks akses</DialogTitle><DialogDescription className="mt-1 text-sm leading-6 text-slate-500">Menu dan akses data dimuat ulang sesuai company dan regional. Backend tetap memvalidasi setiap akses.</DialogDescription><form onSubmit={switchContext} className="mt-5 space-y-4"><label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Company</span><select required value={companyId} onChange={(e) => { setCompanyId(e.target.value); setAreaId(""); }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600"><option value="" disabled>Pilih company</option>{context.company_id && !companies.some((company) => company.id === context.company_id) && <option value={context.company_id}>Company aktif</option>}{companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}<option value="custom">Masukkan company UUID…</option></select></label>{companyId === "custom" && <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Company UUID</span><Input value={customCompanyId} onChange={(e) => setCustomCompanyId(e.target.value)} placeholder="UUID dari administrator" maxLength={36} required/></label>}<label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Regional</span><select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600"><option value="">Semua regional yang diizinkan</option>{areasForCompany.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}<option value="custom">Masukkan regional UUID…</option></select></label>{areaId === "custom" && <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">Regional UUID</span><Input value={customAreaId} onChange={(e) => setCustomAreaId(e.target.value)} placeholder="UUID dari administrator" maxLength={36} required/></label>}{switchError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{switchError}</p>}<Button className="w-full" disabled={switchBusy || !resolvedCompanyId || (companyId === "custom" && customCompanyId.length < 36) || (areaId === "custom" && customAreaId.length < 36)}>{switchBusy ? <LoaderCircle className="size-4 animate-spin"/> : <><ArrowRightLeft className="size-4"/> Terapkan konteks</>}</Button></form></DialogContent></Dialog>
            <button className="relative grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="Notifikasi"><Bell className="size-[17px]"/><span className="absolute right-[9px] top-[9px] size-1.5 rounded-full border border-white bg-rose-500"/></button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block"/><button onClick={logout} className="flex shrink-0 items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-slate-100" title="Keluar"><span className="grid size-8 place-items-center rounded-full bg-[#d9eee8] text-[11px] font-bold text-teal-900">OS</span><span className="hidden lg:block"><span className="block text-[11px] font-bold text-slate-800">Operator</span><span className="block text-[9px] text-slate-400">Secure session</span></span><LogOut className="ml-1 hidden size-4 text-slate-400 lg:block"/></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8 lg:px-8">{children}</main>
        <footer className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 pb-7 text-[10px] text-slate-400 sm:px-7 lg:px-8"><span>OmniSight Operations · Internal use</span><span className="hidden items-center gap-1.5 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500"/> All systems monitored</span><button className="inline-flex items-center gap-1.5 hover:text-teal-800"><CircleHelp className="size-3.5"/> Help center</button></footer>
      </div>
    </div>
  </NavigationProvider>;
}

function groupItems(items: NavigationItem[]) {
  const map = new Map<string, { code: string; name: string; items: NavigationItem[] }>();
  for (const item of items) { if (!map.has(item.group_code)) map.set(item.group_code, { code: item.group_code, name: item.group_name, items: [] }); map.get(item.group_code)!.items.push(item); }
  return [...map.values()];
}
function SidebarBrand({ collapsed }: { collapsed: boolean }) { return <div className="flex h-[72px] items-center gap-3 border-b border-white/[.08] px-5"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-300 text-teal-950"><Command className="size-[18px]"/></div>{!collapsed && <div><div className="font-display text-sm font-bold tracking-tight">OmniSight</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.2em] text-teal-100/55">Operations hub</div></div>}</div>; }
function NavigationLink({ item, active, collapsed, onNavigate }: { item: NavigationItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) { const Icon = moduleIcons[item.module_code] || Activity; return <Link href={`/${item.module_code}`} onClick={onNavigate} title={collapsed ? `${item.module_code} · ${item.module_name}` : undefined} className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 text-xs font-medium transition ${active ? "bg-teal-300 text-teal-950 shadow-sm" : "text-slate-300 hover:bg-white/[.07] hover:text-white"} ${collapsed ? "justify-center px-0" : ""}`}><Icon className="size-[17px] shrink-0"/><span className={`min-w-0 flex-1 truncate ${collapsed ? "sr-only" : ""}`}>{item.module_name}</span>{!collapsed && <span className={`text-[9px] font-bold ${active ? "text-teal-800/70" : "text-slate-500"}`}>{item.module_code}</span>}</Link>; }
function NavLoading({ collapsed }: { collapsed: boolean }) { return <div className="space-y-5 px-2">{[0, 1, 2].map((group) => <div key={group} className="space-y-2"><div className={`h-2 rounded bg-white/10 ${collapsed ? "mx-auto w-6" : "w-20"}`}/>{[0, 1].map((row) => <div key={row} className={`h-10 animate-pulse rounded-xl bg-white/[.06] ${collapsed ? "mx-auto w-10" : ""}`}/>)}</div>)}</div>; }
