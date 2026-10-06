import { ReactNode } from "react";
import { cn } from "@/lib/utility";
import { getPreference } from "@/lib/storage";
import { SidebarCollapsibleValues, SidebarVariantValues } from "../theme/layouts";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../../uix/sidebar";
import { Separator } from "../../uix/separator";
import { AppSidebar } from "./widget/sidebar";
import { BoardBreadcrumb } from "./widget/breadcrumb";
import { BoardErrorBoundary } from "./widget/error-boundary";

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [variant, collapsible] = await Promise.all([
    getPreference("sidebar_variant", SidebarVariantValues, "inset"),
    getPreference("sidebar_collapsible", SidebarCollapsibleValues, "icon"),
  ]);
  return (
    <SidebarProvider
      defaultOpen={collapsible === "icon"}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 68)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant={variant} collapsible={collapsible} />
      <SidebarInset
        className={cn(
          "[html[data-content-layout=centered]_&>*]:mx-auto",
          "[html[data-content-layout=centered]_&>*]:w-full",
          "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
          "peer-data-[variant=inset]:border",
          "[--dashboard-header-height:--spacing(12)]",
          "min-w-0 overflow-x-hidden",
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <BoardBreadcrumb />
            </div>
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-2 has-data-[content-padding=false]:p-0 md:p-3 md:has-data-[content-padding=false]:p-0">
          <BoardErrorBoundary>{children}</BoardErrorBoundary>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
