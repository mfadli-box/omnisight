"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Feedback } from "@/components/features/shared/form-feedback";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { ApiError, message, workspaceApi } from "@/services/api";
import { useWorkspaceStore } from "@/stores/workspace";
import type { NavigationItem } from "@/validations/tenant.schema";
import { AppSidebar } from "./app-sidebar";
import { NavigationProvider } from "./navigation-context";
import { SiteHeader } from "./site-header";

export default function AppShell({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NavigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const collapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const setContext = useWorkspaceStore((state) => state.setContext);

  useEffect(() => {
    const controller = new AbortController();
    workspaceApi.navigation(controller.signal).then((navigation) => {
      if (controller.signal.aborted) return;
      setContext(navigation.context);
      setItems(navigation.data);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) window.location.replace("/login");
      else setError(message(failure));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, setContext]);

  function refresh() {
    setLoading(true);
    setError("");
    setRevision((value) => value + 1);
  }

  return <NavigationProvider value={{ items, loading, error, refresh }}>
    <div className={cn("min-h-dvh lg:grid", collapsed ? "lg:grid-cols-[4.25rem_minmax(0,1fr)]" : "lg:grid-cols-[17rem_minmax(0,1fr)]")}>
      <aside id="desktop-sidebar" className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card lg:flex"><AppSidebar /></aside>
      <div className="min-w-0">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">
          {error ? <div className="space-y-3"><Feedback error={error} /><Button variant="outline" onClick={refresh}>Muat ulang workspace</Button></div> : children}
        </main>
      </div>
    </div>
    <Toaster />
  </NavigationProvider>;
}
