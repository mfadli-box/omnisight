"use client";

import { create } from "zustand";
import type { WorkspaceContext } from "@/validations/tenant.schema";

type WorkspaceState = {
  activeCompany: string | null;
  activeArea: string | null;
  sidebarCollapsed: boolean;
  collapsedGroups: Record<string, boolean>;
  drawerOpen: boolean;
  theme: "light" | "dark";
  setContext: (context: WorkspaceContext) => void;
  toggleSidebar: () => void;
  setGroupCollapsed: (group: string, collapsed: boolean) => void;
  setDrawerOpen: (drawerOpen: boolean) => void;
  setTheme: (theme: "light" | "dark") => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeCompany: null,
  activeArea: null,
  sidebarCollapsed: false,
  collapsedGroups: {},
  drawerOpen: false,
  theme: "light",
  setContext: (context) => set({ activeCompany: context.company_id, activeArea: context.area_id }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setGroupCollapsed: (group, collapsed) => set((state) => ({
    collapsedGroups: { ...state.collapsedGroups, [group]: collapsed },
  })),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setTheme: (theme) => set({ theme }),
}));
