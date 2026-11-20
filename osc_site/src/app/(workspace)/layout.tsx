import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import DashboardShell from "@/components/workspace/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = (await cookies()).get("omnisight_session")?.value;
  if (!session) redirect("/login");
  return <DashboardShell>{children}</DashboardShell>;
}
