"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Company } from "@/validations/auth.schema";

const TenantContext = createContext<{
  tenant: Company | null;
  setTenant: (company: Company) => void;
} | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Company | null>(null);
  return <TenantContext.Provider value={{ tenant, setTenant }}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const value = useContext(TenantContext);
  if (!value) throw new Error("TenantProvider is required");
  return value;
}
