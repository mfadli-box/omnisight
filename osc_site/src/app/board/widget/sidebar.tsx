"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { WS_CONF } from "@/lib/backend";
import { usePreferencesStore } from "@/app/theme";
import { isSessionExpired, forceLogout } from "@/lib/utility";
import { useSessionSnapshot } from "@/lib/use-session";
import { Command, CircleUser, Lock, EllipsisVertical, LogOut, List } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/uix/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/uix/dropdown-menu";
import { Card, CardDescription, CardHeader } from "@/uix/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/uix/avatar";
import { NavMain } from "./module";
import { CompanyCombobox } from "./company";
import { useModuleItem } from "../model/module";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navItems = useModuleItem();
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );
  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useSessionSnapshot();
  const forceClientLogout = () => forceLogout(router);
  const sessionName = session?.user_profile.fullname || "---";
  const sessionEmail = session?.user_profile.email || "---";
  const handleLogout = async () => {
    if (!session) {
      forceClientLogout();
      return;
    }
    setError(null);
    setIsBusy(true);
    try {
      fetch("/proxy/pages/APP00", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      forceClientLogout();
    } catch (err) {
      if (err instanceof Response) {
        if (err.status === 401 || err.status === 403) {
          forceClientLogout();
          return;
        }
        setError("Failed to logout");
      } else {
        setError("A network error occurred while logging out.");
      }
    } finally {
      setIsBusy(false);
    }
  };
  const { isMobile } = useSidebar();
  const isHydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  useEffect(() => {
    if (!isHydrated) return;
    if (!session || isSessionExpired(session)) {
      forceLogout(router);
      return;
    }
    fetch("/proxy/pages/APP00/company", {
      headers: { Authorization: `Bearer ${session.token}` },
    }).then((res) => {
      if (res.status === 401 || res.status === 403) forceLogout(router);
    }).catch(() => forceLogout(router));
  }, [router, session, isHydrated]);
  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link prefetch={false} href="/board" />}>
              <Command />
              <span className="font-semibold text-base">{WS_CONF.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <CompanyCombobox />
        <div className="mx-2 h-px bg-sidebar-border group-data-[collapsible=icon]:hidden" />
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        {error ? (
          <Card size="sm" className="overflow-hidden shadow-none group-data-[collapsible=icon]:hidden">
            <CardHeader className="min-w-0">
              <CardDescription className="text-rose-700">
                {error}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={undefined} alt={session?.user_profile.fullname || "---"} />
                  <AvatarFallback className="rounded-lg">ID</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{sessionName}</span>
                  <span className="truncate text-muted-foreground text-xs">{sessionEmail}</span>
                </div>
                <EllipsisVertical className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--anchor-width) min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={undefined} alt={sessionName} />
                    <AvatarFallback className="rounded-lg">ID</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{sessionName}</span>
                    <span className="truncate text-muted-foreground text-xs">{sessionEmail}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/board/pages/SYS01")}>
                    <CircleUser /> Profile
                  </DropdownMenuItem>
                  {!session?.user_profile.is_hris ? (
                    <DropdownMenuItem onClick={() => router.push("/board/pages/SYS02")}>
                      <Lock /> Password
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => router.push("/board/pages/SYS03")}>
                    <List /> History
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} disabled={isBusy}>
                  <LogOut /> {isBusy ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
