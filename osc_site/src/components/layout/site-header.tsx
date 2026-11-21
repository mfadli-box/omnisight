"use client";

import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ApiError, message, workspaceApi } from "@/services/api";
import { useWorkspaceStore } from "@/stores/workspace";
import { AppSidebar } from "./app-sidebar";
import { CompanySwitcher } from "./company-switcher";
import { useNavigation } from "./navigation-context";
import { ThemeSwitcher } from "./theme-switcher";

export function SiteHeader() {
  const { items } = useNavigation();
  const pathname = usePathname();
  const active = items.find((item) => `/${item.module_code}` === pathname);
  const group = active && active.group_name !== active.module_name ? active.group_name : undefined;
  const collapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const drawer = useWorkspaceStore((state) => state.drawerOpen);
  const setDrawer = useWorkspaceStore((state) => state.setDrawerOpen);
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await workspaceApi.logout();
      window.location.replace("/login");
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) window.location.replace("/login");
      else { toast.error(message(failure)); setBusy(false); }
    }
  }

  return <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center gap-2 border-b border-border bg-card px-3 sm:px-6">
    <Sheet open={drawer} onOpenChange={setDrawer}>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka navigasi" />}><Menu /></SheetTrigger>
      <SheetContent><AppSidebar mobile /></SheetContent>
    </Sheet>
    <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={toggleSidebar} aria-expanded={!collapsed}
      aria-controls="desktop-sidebar" aria-label={collapsed ? "Lebarkan sidebar" : "Ringkas sidebar"}>
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
    <div className="min-w-0 flex-1 truncate text-sm font-medium text-muted">
      <span className="hidden sm:inline">{group && `${group} / `}</span>
      <span className="text-foreground">{active?.module_name || "Workspace"}</span>
    </div>
    <CompanySwitcher />
    <ThemeSwitcher />
    <Button variant="ghost" size="icon" aria-label="Keluar" disabled={busy} onClick={() => void logout()}><LogOut /></Button>
  </header>;
}
