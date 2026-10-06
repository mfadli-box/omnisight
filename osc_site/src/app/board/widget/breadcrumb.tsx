"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { type NavGroup, useModuleItem } from "../model/module";

type BreadcrumbItem = {
  label: string;
};

function getBreadcrumb(pathname: string, groups: NavGroup[]): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [{ label: "Board" }];
  if (pathname === "/board") {
    return items;
  }
  for (const group of groups) {
    for (const item of group.items) {
      if (Array.isArray(item.subItems)) {
        const currentSubItem = item.subItems.find(
          (sub) => pathname === sub.url || pathname.startsWith(`${sub.url}/`),
        );
        if (currentSubItem) {
          items.push({ label: item.title });
          items.push({ label: currentSubItem.title });
          return items;
        }
        continue;
      }
      if (
        "url" in item &&
        (pathname === item.url || (item.url !== "/board" && pathname.startsWith(`${item.url}/`)))
      ) {
        items.push({ label: item.title });
        return items;
      }
    }
  }
  const fallback = pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]/g, " ");
  if (fallback) {
    items.push({ label: fallback });
  }
  return items;
}

export function BoardBreadcrumb() {
  const pathname = usePathname();
  const navItems = useModuleItem();
  const breadcrumbItems = useMemo(() => getBreadcrumb(pathname, navItems), [pathname, navItems]);
  return (
    <nav className="flex items-center gap-2 text-sm">
      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            <span className={isLast ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
            {!isLast ? <span className="text-muted-foreground">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}
