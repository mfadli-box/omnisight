"use client";

import { Toaster as Sonner } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace";

export function Toaster() {
  const theme = useWorkspaceStore((state) => state.theme);
  return <Sonner theme={theme} position="bottom-right" richColors />;
}
