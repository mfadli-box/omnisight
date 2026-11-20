"use client";

import { createContext, useContext } from "react";

export type NavigationItem = { group_code: string; group_name: string; module_code: string; module_name: string };
export type WorkspaceContext = { company_id?: string; area_id?: string | null; area_ids?: string[] };
type Value = { items: NavigationItem[]; context: WorkspaceContext; refresh: () => Promise<void>; loading: boolean };
const NavigationContext = createContext<Value>({ items: [], context: {}, refresh: async () => {}, loading: true });
export const NavigationProvider = NavigationContext.Provider;
export function useNavigation() { return useContext(NavigationContext); }
