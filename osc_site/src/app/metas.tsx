import { WS_PREF_D, WS_PREF_P } from "./theme/setting";

export function ThemeBootScript() {
  const persistence = JSON.stringify({
    theme_mode: WS_PREF_P.theme_mode,
    theme_preset: WS_PREF_P.theme_preset,
    font: WS_PREF_P.font,
    content_layout: WS_PREF_P.content_layout,
    navbar_style: WS_PREF_P.navbar_style,
    sidebar_variant: WS_PREF_P.sidebar_variant,
    sidebar_collapsible: WS_PREF_P.sidebar_collapsible,
  });
  const defaults = JSON.stringify({
    theme_mode: WS_PREF_D.theme_mode,
    theme_preset: WS_PREF_D.theme_preset,
    font: WS_PREF_D.font,
    content_layout: WS_PREF_D.content_layout,
    navbar_style: WS_PREF_D.navbar_style,
    sidebar_variant: WS_PREF_D.sidebar_variant,
    sidebar_collapsible: WS_PREF_D.sidebar_collapsible,
  });
  const code = `
    (function () {
      try {
        var root = document.documentElement;
        var PERSISTENCE = ${persistence};
        var DEFAULTS = ${defaults};
        function readCookie(name) {
          var match = document.cookie.split("; ").find(function(c) {
            return c.startsWith(name + "=");
          });
          return match ? decodeURIComponent(match.split("=")[1]) : null;
        }
        function readLocal(name) {
          try {
            return window.localStorage.getItem(name);
          } catch (e) {
            return null;
          }
        }
        function readPreference(key, fallback) {
          var mode = PERSISTENCE[key];
          var value = null;
          if (mode === "localStorage") {
            value = readLocal(key);
          }
          if (!value && (mode === "client-cookie" || mode === "server-cookie")) {
            value = readCookie(key);
          }
          if (!value || typeof value !== "string") {
            return fallback;
          }
          return value;
        }
        var rawMode = readPreference("theme_mode", DEFAULTS.theme_mode);
        var rawPreset = readPreference("theme_preset", DEFAULTS.theme_preset);
        var rawFont = readPreference("font", DEFAULTS.font);
        var rawContentLayout = readPreference("content_layout", DEFAULTS.content_layout);
        var rawNavbarStyle = readPreference("navbar_style", DEFAULTS.navbar_style);
        var rawSidebarVariant = readPreference("sidebar_variant", DEFAULTS.sidebar_variant);
        var rawSidebarCollapsible = readPreference("sidebar_collapsible", DEFAULTS.sidebar_collapsible);
        var isValidMode = rawMode === "dark" || rawMode === "light" || rawMode === "system";
        var mode = isValidMode ? rawMode : DEFAULTS.theme_mode;
        var resolvedMode =
          mode === "system" && window.matchMedia
            ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
            : mode;
        var preset = rawPreset || DEFAULTS.theme_preset;
        var font = rawFont || DEFAULTS.font;
        var contentLayout = rawContentLayout || DEFAULTS.content_layout;
        var navbarStyle = rawNavbarStyle || DEFAULTS.navbar_style;
        var sidebarVariant = rawSidebarVariant || DEFAULTS.sidebar_variant;
        var sidebarCollapsible = rawSidebarCollapsible || DEFAULTS.sidebar_collapsible;
        root.classList.toggle("dark", resolvedMode === "dark");
        root.setAttribute("data-theme-mode", mode);
        root.setAttribute("data-theme-preset", preset);
        root.setAttribute("data-font", font);
        root.setAttribute("data-content-layout", contentLayout);
        root.setAttribute("data-navbar-style", navbarStyle);
        root.setAttribute("data-sidebar-variant", sidebarVariant);
        root.setAttribute("data-sidebar-collapsible", sidebarCollapsible);
        root.style.colorScheme = resolvedMode === "dark" ? "dark" : "light";
      } catch (e) {
        console.warn("ThemeBootScript error:", e);
      }
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
