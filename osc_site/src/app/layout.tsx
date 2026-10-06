import type { ReactNode } from "react";
import type { Metadata } from "next";
import { WS_CONF } from "@/lib/backend";
import { PreferencesStoreProvider } from "./theme";
import { WS_PREF_D } from "./theme/setting";
import { fontVars } from "./theme/fonts";
import { ThemeBootScript } from "./metas";
import { Toaster } from "@/uix/sonner";
import { TooltipProvider } from "@/uix/tooltip";
import { ErrorBoundary } from "@/uix/error-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: WS_CONF.meta.title,
  description: WS_CONF.meta.description,
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const {
    theme_mode, theme_preset,
    content_layout, navbar_style, font,
    sidebar_variant, sidebar_collapsible
  } = WS_PREF_D;
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootScript />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        <TooltipProvider>
          <PreferencesStoreProvider
            themeMode={theme_mode}
            themePreset={theme_preset}
            contentLayout={content_layout}
            navbarStyle={navbar_style}
            font={font}
          >
            <ErrorBoundary>{children}</ErrorBoundary>
            <Toaster />
          </PreferencesStoreProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
