"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, Command, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NavigationProvider, type NavigationItem, type WorkspaceContext } from "./navigation-context";
import { apiData, message, type Area } from "@/lib/workspace/api";

type CompanyContext = { id: string; name: string; company_wide: boolean; areas: Area[] };
const selectClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [items, setItems] = useState<NavigationItem[]>([]);
  const [context, setContext] = useState<WorkspaceContext>({});
  const [companies, setCompanies] = useState<CompanyContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [navError, setNavError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [areaId, setAreaId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setNavError("");
    try {
      const response = await fetch("/api/me/navigation", { cache: "no-store" });
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Navigasi gagal dimuat.");
      setItems(payload.data);
      setContext(payload.context);
    } catch (error) {
      setItems([]);
      setNavError(message(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDirectory = useCallback(async (signal?: AbortSignal) => {
    setDirectoryError("");
    try {
      setCompanies(await apiData<CompanyContext[]>("me/contexts", { signal }));
    } catch (error) {
      if (!signal?.aborted) setDirectoryError(message(error));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh();
    void loadDirectory(controller.signal);
    return () => controller.abort();
  }, [refresh, loadDirectory]);

  const groups = useMemo(() => {
    const grouped = new Map<string, NavigationItem[]>();
    for (const item of items) {
      const group = grouped.get(item.group_code);
      if (group) group.push(item);
      else grouped.set(item.group_code, [item]);
    }
    return [...grouped.values()];
  }, [items]);

  const activeItem = items.find((item) => `/${item.module_code}` === pathname);
  const activeCompany = companies.find((company) => company.id === context.company_id);
  const activeArea = activeCompany?.areas.find((area) => area.id === context.area_id);
  const selectedCompany = companies.find((company) => company.id === companyId);

  async function authenticate(path: "switch-company" | "logout", payload?: object) {
    setBusy(true);
    setActionError("");
    try {
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        ...(payload && { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
      });
      if (!response.ok && response.status !== 401) {
        const body = await response.json();
        throw new Error(body.error?.message || "Permintaan tidak dapat diproses.");
      }
      window.location.replace(path === "logout" || response.status === 401 ? "/login" : "/");
    } catch (error) {
      setActionError(message(error));
      setBusy(false);
    }
  }

  function switchContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void authenticate("switch-company", { company_id: companyId, area_id: areaId || null });
  }

  const navigation = (mobile: boolean) => <nav className="flex-1 space-y-5 overflow-y-auto p-4" aria-label="Navigasi modul">
    {loading && <p role="status" className="text-sm text-slate-300">Memuat menu…</p>}
    {navError && <div className="space-y-2 text-sm"><p role="alert">{navError}</p>
      <Button variant="outline" onClick={() => void refresh()}>Coba lagi</Button></div>}
    {!loading && !navError && groups.length === 0 && <p className="text-sm text-slate-300">Belum ada modul yang dapat diakses.</p>}
    {groups.map((group) => <div key={group[0].group_code}>
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{group[0].group_name}</h2>
      <ul className="space-y-1">{group.map((item) => <li key={item.module_code}>
        <Link href={`/${item.module_code}`} aria-current={item === activeItem ? "page" : undefined}
          onClick={mobile ? () => setDrawerOpen(false) : undefined}
          className="block rounded-lg px-3 py-2.5 text-sm text-white hover:bg-white/10 aria-[current=page]:bg-teal-300 aria-[current=page]:text-teal-950">
          {item.module_name}
        </Link>
      </li>)}</ul>
    </div>)}
  </nav>;

  return <NavigationProvider value={{ items, context, refresh, loading }}>
    <div className="min-h-screen bg-[#f4f6f8] lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#142b30] text-white lg:flex">
        <Brand />{navigation(false)}
      </aside>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-7">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild><Button variant="outline" className="lg:hidden" aria-label="Buka navigasi"><Menu /></Button></SheetTrigger>
          <SheetContent aria-describedby={undefined} className="border-teal-950 bg-[#142b30] text-white">
            <Brand />{navigation(true)}
          </SheetContent>
        </Sheet>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{activeItem?.module_name || "OmniSight"}</p>
        <Dialog open={switchOpen} onOpenChange={(open) => {
          if (busy) return;
          if (open) {
            setCompanyId(context.company_id || "");
            setAreaId(context.area_id || "");
            setActionError("");
          }
          setSwitchOpen(open);
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" aria-label="Ganti company dan area" disabled={busy}>
              <Building2 /><span className="hidden max-w-48 truncate sm:block">
                {activeCompany?.name || "Company"} · {activeArea?.name || (context.area_id ? "Area aktif" : "Semua area")}
              </span><ChevronDown />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle className="text-lg font-semibold">Ganti company dan area</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-600">Pilih cakupan akses untuk workspace ini.</DialogDescription>
            <form onSubmit={switchContext} className="mt-5 space-y-4">
              <label className="block space-y-1 text-sm">Company
                <select className={selectClass} value={companyId} required disabled={busy} onChange={(event) => {
                  setCompanyId(event.target.value);
                  setAreaId("");
                }}>
                  <option value="">Pilih company</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm">Area
                <select className={selectClass} value={areaId} required={selectedCompany?.company_wide === false}
                  disabled={busy || !selectedCompany} onChange={(event) => setAreaId(event.target.value)}>
                  <option value="">{selectedCompany?.company_wide ? "Semua area" : "Pilih area"}</option>
                  {selectedCompany?.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </label>
              {directoryError && <div className="space-y-2"><p role="alert" className="text-sm text-rose-700">{directoryError}</p>
                <Button type="button" variant="outline" onClick={() => void loadDirectory()}>Muat ulang daftar</Button></div>}
              {actionError && <p role="alert" className="text-sm text-rose-700">{actionError}</p>}
              <Button className="w-full" disabled={busy || !selectedCompany}>{busy ? "Menerapkan…" : "Terapkan"}</Button>
            </form>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" disabled={busy} onClick={() => void authenticate("logout")} aria-label="Keluar"><LogOut /></Button>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 lg:px-8">
        {!switchOpen && actionError && <p role="alert" className="mb-4 text-sm text-rose-700">{actionError}</p>}
        {navError ? <p role="alert" className="text-sm text-rose-700">{navError} <Button variant="outline" onClick={() => void refresh()}>Muat ulang</Button></p>
          : children}
      </main>
    </div>
  </NavigationProvider>;
}

function Brand() {
  return <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
    <span className="grid size-9 place-items-center rounded-xl bg-teal-300 text-teal-950"><Command className="size-5" /></span>
    <span className="font-display font-bold">OmniSight</span>
  </div>;
}
