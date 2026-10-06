"use client";

import {
  type LucideIcon,
  Activity, AppWindow, Container, Cpu, FileText, Globe, Lock,
  ReceiptText, ServerCog, Shield, Users,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePreferencesStore } from "@/app/theme";
import { parseSession, storageKey } from "@/lib/utility";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}
interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}
export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}
export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}
export type NavMainItem = NavMainLinkItem | NavMainParentItem;
export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

type ModuleTreeNode = {
  id: string;
  code: string;
  name: string;
  path: string;
  is_page: boolean;
  children?: ModuleTreeNode[];
};

const staticAppItem: NavMainParentItem = {
  id: "APP",
  title: "Application",
  icon: AppWindow,
  subItems: [
    { id: "APP01", title: "User", url: "/board/pages/APP/APP01", newTab: false },
    { id: "APP02", title: "Company", url: "/board/pages/APP/APP02", newTab: false },
    { id: "APP03", title: "Module", url: "/board/pages/APP/APP03", newTab: false },
    { id: "APP04", title: "Signature", url: "/board/pages/APP/APP04", newTab: false },
    { id: "APP05", title: "Session", url: "/board/pages/APP/APP05", newTab: false },
  ],
};

const staticSessionItem: NavMainParentItem = {
  id: "SYS",
  title: "Session Profile",
  icon: Users,
  subItems: [
    { id: "SYS01", title: "Profile", url: "/board/pages/SYS/SYS01", newTab: false },
    { id: "SYS02", title: "Password", url: "/board/pages/SYS/SYS02", newTab: false },
    { id: "SYS03", title: "History", url: "/board/pages/SYS/SYS03", newTab: false },
  ],
};

export const moduleItem: NavGroup[] = [
  {
    id: 1,
    label: "",
    items: [],
  },
];

function mapIconByCode(code: string): LucideIcon | undefined {
  const key = code.slice(0, 3).toUpperCase();
  if (key === "APP") return AppWindow;
  if (key === "AMM") return ServerCog;
  if (key === "BOT") return Cpu;
  if (key === "DOC") return FileText;
  if (key === "DSO") return ServerCog;
  if (key === "JMS") return Lock;
  if (key === "NET") return Activity;
  if (key === "OBS") return Activity;
  if (key === "POD") return Container;
  if (key === "SYS") return Users;
  if (key === "VMS") return Cpu;
  if (key === "WAF") return Shield;
  if (key === "WEB") return Globe;
  return ReceiptText;
}

function collectSubItems(nodes: ModuleTreeNode[]): NavSubItem[] {
  const out: NavSubItem[] = [];
  for (const node of nodes) {
    if (node.path) {
      out.push({
        id: node.code,
        title: node.name,
        url: node.path,
        newTab: !node.is_page,
      });
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      out.push(...collectSubItems(node.children));
    }
  }
  return out;
}

function toNavItem(node: ModuleTreeNode): NavMainItem | null {
  const icon = mapIconByCode(node.code);
  if (node.is_page) {
    if (!node.path) return null;
    return { id: node.code, title: node.name, icon, url: node.path, newTab: false };
  }
  const subItems = Array.isArray(node.children) ? collectSubItems(node.children) : [];
  return { id: node.code, title: node.name, icon, subItems };
}

function dedupeById(items: NavMainItem[]): NavMainItem[] {
  const map = new Map<string, NavMainItem>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function buildNavGroups(nodes: ModuleTreeNode[], isLoggedIn: boolean, isAdmin: boolean): NavGroup[] {
  const items: NavMainItem[] = [];
  for (const root of nodes) {
    const navItem = toNavItem(root);
    if (navItem) items.push(navItem);
  }
  if (isAdmin) items.push(staticAppItem);
  if (isLoggedIn) items.push(staticSessionItem);
  return [
    {
      id: 1,
      label: "",
      items: dedupeById(items),
    },
  ];
}

export function useModuleItem(): NavGroup[] {
  const storeCompanyId = usePreferencesStore((s) => s.companyId);
  const [items, setItems] = useState<NavGroup[]>(moduleItem);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  useEffect(() => {
    if (!isHydrated) return;
    let active = true;
    const load = async () => {
      const session = parseSession(window.localStorage.getItem(storageKey));
      const isLoggedIn = Boolean(session?.token);
      const isAdmin = Boolean(session?.user_profile.is_admin);
      if (!isLoggedIn || !session) {
        if (active) setItems(buildNavGroups([], false, false));
        return;
      }
      const companyId = storeCompanyId || window.localStorage.getItem("OmniSightCompany") || "";
      if (!companyId) {
        if (active) setItems(buildNavGroups([], true, isAdmin));
        return;
      }
      try {
        const response = await fetch(`/proxy/pages/APP00/module?company_id=${companyId}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await response.json();
        const tree = Array.isArray(data?.data) ? data.data : [];
        if (active) setItems(buildNavGroups(tree, true, isAdmin));
      } catch {
        if (active) setItems(buildNavGroups([], true, isAdmin));
      }
    };
    void load();
    return () => { active = false; };
  }, [storeCompanyId, isHydrated]);
  return items;
}
