"use client";

import { createContext, useContext } from "react";
import type { NavigationItem } from "@/validations/tenant.schema";

type Navigation = {
  items: NavigationItem[];
  loading: boolean;
  error: string;
  refresh: () => void;
};
const Context = createContext<Navigation>({ items: [], loading: true, error: "", refresh: () => {} });

export const NavigationProvider = Context.Provider;
export function useNavigation() { return useContext(Context); }
