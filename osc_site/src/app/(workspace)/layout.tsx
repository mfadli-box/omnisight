import { sessionToken } from "@/services/backend";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await sessionToken();
  if (!session) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
