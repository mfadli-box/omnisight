"use client";

import {
  Activity, Aperture, Building2, ChevronDown, Circle, FileSpreadsheet, Fingerprint,
  HeartPulse, KeyRound, NotebookText, Plug, Printer, Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarGroupContent, SidebarGroupTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace";
import type { NavigationItem } from "@/validations/tenant.schema";
import { useNavigation } from "./navigation-context";

const icons = new Map([
  ["CT01", Activity], ["OP01", KeyRound], ["OP02", HeartPulse], ["KB01", NotebookText],
  ["RP01", FileSpreadsheet], ["RP02", Printer], ["SA01", Building2], ["SA02", Users],
  ["SA03", Fingerprint], ["SA04", Plug],
]);

export function AppSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { items, loading, error, refresh } = useNavigation();
  const collapsed = useWorkspaceStore((state) => !mobile && state.sidebarCollapsed);
  const collapsedGroups = useWorkspaceStore((state) => state.collapsedGroups);
  const setGroupCollapsed = useWorkspaceStore((state) => state.setGroupCollapsed);
  const closeDrawer = useWorkspaceStore((state) => state.setDrawerOpen);

  const groups = useMemo(() => {
    const result = new Map<string, NavigationItem[]>();
    for (const item of items) {
      const group = result.get(item.group_code);
      if (group) group.push(item);
      else result.set(item.group_code, [item]);
    }
    return [...result.values()];
  }, [items]);

  return <>
    <Link href="/" onClick={mobile ? () => closeDrawer(false) : undefined}
      className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-border px-5 font-semibold outline-primary", collapsed && "justify-center px-0")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Aperture className="size-5" /></span>
      <span className={collapsed ? "sr-only" : undefined}>OmniSight</span>
    </Link>
    <nav aria-label="Navigasi modul" className={cn("flex-1 space-y-4 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
      {loading && <p role="status" className={cn("px-2 text-sm text-muted", collapsed && "sr-only")}>Memuat menu…</p>}
      {error && <Button variant="ghost" size="sm" onClick={refresh} className={collapsed ? "sr-only focus:not-sr-only" : undefined}>Muat ulang menu</Button>}
      {!loading && !error && !groups.length && <p className={cn("px-2 text-sm text-muted", collapsed && "sr-only")}>Belum ada akses modul.</p>}
      {groups.map((group) => {
        const { group_code: code, group_name: name } = group[0];
        return <SidebarGroup key={code} open={collapsed || !collapsedGroups[code]}
          onOpenChange={(open) => setGroupCollapsed(code, !open)}>
          {collapsed ? <p className="mb-1 text-center text-[10px] font-semibold text-muted" title={name}>{code}</p>
            : <SidebarGroupTrigger className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted outline-primary hover:bg-surface [&[data-panel-open]_svg]:rotate-180">
              {name}<ChevronDown className="size-3.5 transition-transform" />
            </SidebarGroupTrigger>}
          <SidebarGroupContent>
            <ul className="mt-1 grid gap-1">{group.map((item) => {
              const href = `/${item.module_code}`;
              const Icon = icons.get(item.module_code) || Circle;
              return <li key={item.module_code}>
                <Link href={href} aria-current={href === pathname ? "page" : undefined} title={collapsed ? item.module_name : undefined}
                  onClick={mobile ? () => closeDrawer(false) : undefined}
                  className={cn("flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted outline-primary hover:bg-surface hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-primary", collapsed && "justify-center px-0")}>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{item.module_name}</span>
                  {!collapsed && <span className="font-mono text-[10px] opacity-75">{item.module_code}</span>}
                </Link>
              </li>;
            })}</ul>
          </SidebarGroupContent>
        </SidebarGroup>;
      })}
    </nav>
  </>;
}
