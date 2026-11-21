"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspace";

export function ThemeSwitcher() {
  const theme = useWorkspaceStore((state) => state.theme);
  const setTheme = useWorkspaceStore((state) => state.setTheme);

  useEffect(() => {
    const saved = localStorage.getItem("omnisight-theme");
    const preferred = saved === "dark" || saved === "light" ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = preferred;
    setTheme(preferred);
  }, [setTheme]);

  const dark = theme === "dark";
  return <Button variant="ghost" size="icon" aria-label={dark ? "Aktifkan tema terang" : "Aktifkan tema gelap"}
    onClick={() => {
      const next = dark ? "light" : "dark";
      setTheme(next);
      document.documentElement.dataset.theme = next;
      localStorage.setItem("omnisight-theme", next);
    }}>{dark ? <Sun /> : <Moon />}</Button>;
}
