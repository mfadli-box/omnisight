import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OmniSight | Operations Control", template: "%s · OmniSight" },
  description: "OmniSight operational visibility and secure administration workspace.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f6f8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="id"><body className="min-h-screen antialiased">{children}</body></html>;
}
