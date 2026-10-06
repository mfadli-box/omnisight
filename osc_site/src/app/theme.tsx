"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { type StoreApi, useStore } from "zustand";
import { type FontKey, fontRegistry } from "./theme/fonts";
import {
  ContentLayoutValues,
  NavbarStyleValues,
  SidebarCollapsibleValues,
  SidebarVariantValues,
} from "./theme/layouts";
import { ThemeModeValues, ThemePresetValues } from "./theme/model";
import { applyThemeMode, subscribeToSystemTheme } from "./theme/utilities";
import { createPreferencesStore, type PreferencesState } from "./theme/stores";

const companyStorageKey = "OmniSightCompany";
const PreferencesStoreContext = createContext<StoreApi<PreferencesState> | null>(null);
const FontValues = Object.keys(fontRegistry) as FontKey[];

function getSafeValue<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  if (!raw) return undefined;
  return allowed.includes(raw as T) ? (raw as T) : undefined;
}
function readDomState(): Partial<PreferencesState> {
  const root = document.documentElement;
  const themeModeAttr = getSafeValue(root.getAttribute("data-theme-mode"), ThemeModeValues);
  const resolvedMode = root.classList.contains("dark") ? "dark" : "light";
  return {
    themeMode: themeModeAttr ?? resolvedMode,
    resolvedThemeMode: resolvedMode,
    themePreset: getSafeValue(root.getAttribute("data-theme-preset"), ThemePresetValues),
    font: getSafeValue(root.getAttribute("data-font"), FontValues),
    contentLayout: getSafeValue(root.getAttribute("data-content-layout"), ContentLayoutValues),
    navbarStyle: getSafeValue(root.getAttribute("data-navbar-style"), NavbarStyleValues),
    sidebarVariant: getSafeValue(root.getAttribute("data-sidebar-variant"), SidebarVariantValues),
    sidebarCollapsible: getSafeValue(root.getAttribute("data-sidebar-collapsible"), SidebarCollapsibleValues),
  };
}

export const PreferencesStoreProvider = ({
  children,
  themeMode,
  themePreset,
  font,
  contentLayout,
  navbarStyle,
}: {
  children: React.ReactNode;
  themeMode: PreferencesState["themeMode"];
  themePreset: PreferencesState["themePreset"];
  font: PreferencesState["font"];
  contentLayout: PreferencesState["contentLayout"];
  navbarStyle: PreferencesState["navbarStyle"];
}) => {
  const [store] = useState<StoreApi<PreferencesState>>(() =>
    createPreferencesStore({
      themeMode,
      themePreset,
      font,
      contentLayout,
      navbarStyle,
    }),
  );
  const domSnapshotRef = useRef<Partial<PreferencesState> | null>(null);
  useEffect(() => {
    const domState = readDomState();
    domSnapshotRef.current = domState;
    store.setState((prev) => ({
      ...prev,
      ...domState,
      isSynced: true,
    }));
  }, [store]);
  useEffect(() => {
    const storedCompany = window.localStorage.getItem(companyStorageKey)?.trim();
    if (storedCompany) {
      store.setState((prev) => ({ ...prev, companyId: storedCompany }));
    }
    const unsubscribeStore = store.subscribe((s, p) => {
      if (s.companyId === p.companyId) {
        return;
      }
      if (s.companyId) {
        window.localStorage.setItem(companyStorageKey, s.companyId);
      } else {
        window.localStorage.removeItem(companyStorageKey);
      }
    });
    return () => {
      unsubscribeStore();
    };
  }, [store]);
  useEffect(() => {
    let unsubscribeMedia: (() => void) | undefined;
    const applyFromMode = (mode: PreferencesState["themeMode"]) => {
      unsubscribeMedia?.();
      const resolved = applyThemeMode(mode);
      store.setState((prev) => ({ ...prev, resolvedThemeMode: resolved }));
      if (mode === "system") {
        unsubscribeMedia = subscribeToSystemTheme(() => {
          const next = applyThemeMode("system");
          store.setState((prev) => ({ ...prev, resolvedThemeMode: next }));
        });
      }
    };
    const startMode = domSnapshotRef.current?.themeMode ?? store.getState().themeMode;
    applyFromMode(startMode);
    const unsubscribeStore = store.subscribe((s, p) => {
      if (s.themeMode !== p.themeMode) applyFromMode(s.themeMode);
    });
    return () => {
      unsubscribeMedia?.();
      unsubscribeStore();
    };
  }, [store]);
  return <PreferencesStoreContext.Provider value={store}>{children}</PreferencesStoreContext.Provider>;
};
export const usePreferencesStore = <T,>(selector: (state: PreferencesState) => T): T => {
  const store = useContext(PreferencesStoreContext);
  if (!store) throw new Error("Missing PreferencesStoreProvider");
  return useStore(store, selector);
};
