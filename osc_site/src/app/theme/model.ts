const ThemeModeOptions = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const;
export const ThemeModeValues = ThemeModeOptions.map((o) => o.value);
export type ThemeMode = (typeof ThemeModeValues)[number];
export type ResolvedThemeMode = "light" | "dark";
export const ThemePresetOptions = [
  {
    label: "Default",
    value: "default",
    primary: {
      light: "oklch(0.205 0 0)",
      dark: "oklch(0.922 0 0)",
    },
  },
] as const;
export const ThemePresetValues = ThemePresetOptions.map((p) => p.value);
export type ThemePreset = (typeof ThemePresetOptions)[number]["value"];
