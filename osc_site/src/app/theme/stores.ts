import { createStore } from "zustand/vanilla";
import type { FontKey } from "./fonts";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "./layouts";
import { WS_PREF_D } from "./setting";
import type { ResolvedThemeMode, ThemeMode, ThemePreset } from "./model";

export type CompanyOption = {
  id: string;
  code: string;
  name: string;
};
export type PreferencesState = {
  themeMode: ThemeMode;
  resolvedThemeMode: ResolvedThemeMode;
  themePreset: ThemePreset;
  font: FontKey;
  contentLayout: ContentLayout;
  navbarStyle: NavbarStyle;
  sidebarVariant: SidebarVariant;
  sidebarCollapsible: SidebarCollapsible;
  companyId: string;
  companyList: CompanyOption[];
  setThemeMode: (mode: ThemeMode) => void;
  setResolvedThemeMode: (mode: ResolvedThemeMode) => void;
  setThemePreset: (preset: ThemePreset) => void;
  setFont: (font: FontKey) => void;
  setContentLayout: (layout: ContentLayout) => void;
  setNavbarStyle: (style: NavbarStyle) => void;
  setSidebarVariant: (variant: SidebarVariant) => void;
  setSidebarCollapsible: (mode: SidebarCollapsible) => void;
  setCompanyId: (id: string) => void;
  setCompanyList: (list: CompanyOption[]) => void;
  isSynced: boolean;
  setIsSynced: (val: boolean) => void;
};
export const createPreferencesStore = (init?: Partial<PreferencesState>) =>
  createStore<PreferencesState>()((set) => ({
    themeMode: init?.themeMode ?? WS_PREF_D.theme_mode,
    resolvedThemeMode: init?.resolvedThemeMode ?? "light",
    themePreset: init?.themePreset ?? WS_PREF_D.theme_preset,
    font: init?.font ?? WS_PREF_D.font,
    contentLayout: init?.contentLayout ?? WS_PREF_D.content_layout,
    navbarStyle: init?.navbarStyle ?? WS_PREF_D.navbar_style,
    sidebarVariant: init?.sidebarVariant ?? WS_PREF_D.sidebar_variant,
    sidebarCollapsible: init?.sidebarCollapsible ?? WS_PREF_D.sidebar_collapsible,
    companyId: init?.companyId ?? "",
    companyList: init?.companyList ?? [],
    setThemeMode: (mode) => set({ themeMode: mode }),
    setResolvedThemeMode: (mode) => set({ resolvedThemeMode: mode }),
    setThemePreset: (preset) => set({ themePreset: preset }),
    setFont: (font) => set({ font }),
    setContentLayout: (layout) => set({ contentLayout: layout }),
    setNavbarStyle: (style) => set({ navbarStyle: style }),
    setSidebarVariant: (variant) => set({ sidebarVariant: variant }),
    setSidebarCollapsible: (mode) => set({ sidebarCollapsible: mode }),
    setCompanyId: (id) => set({ companyId: id.trim() }),
    setCompanyList: (list) => set({ companyList: list }),
    isSynced: init?.isSynced ?? false,
    setIsSynced: (val) => set({ isSynced: val }),
  }));
