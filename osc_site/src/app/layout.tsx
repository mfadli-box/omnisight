import { TenantProvider } from "@/components/auth/TenantContext";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Masuk | OmniSight" };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="id"><body><TenantProvider>{children}</TenantProvider></body></html>;
}
