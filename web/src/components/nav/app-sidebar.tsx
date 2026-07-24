"use client";

import * as React from "react";
import { NavMain, type NavMainItem } from "@/src/components/nav/nav-main";
import {
  NavUser,
  type UserNavigationProps,
} from "@/src/components/nav/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/src/components/ui/sidebar";
import { env } from "@/src/env.mjs";
import { useRouter } from "next/router";
import Link from "next/link";
import { LangfuseLogo } from "@/src/components/LangfuseLogo";
import { MobileNavSwitcher } from "@/src/components/nav/mobile-nav-switcher";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { type RouteGroup } from "@/src/components/layouts/routes";
import { ExternalLink, Grid2X2 } from "lucide-react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

type AppSidebarProps = {
  navItems: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
  secondaryNavItems: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
  userNavProps: UserNavigationProps;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  navItems,
  secondaryNavItems,
  userNavProps,
  ...props
}: AppSidebarProps) {
  const { isMobile } = useSidebar();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader className="gap-0 pt-0">
        {/* Logo band (sessions handoff): fixed-height row closed by a
            full-bleed hairline, logo + mono version inside. */}
        <div className="border-sidebar-border flex h-10 shrink-0 items-center gap-2 border-b pt-2 pr-0 pl-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
          <LangfuseLogo version />
        </div>
        <DemoBadge />
      </SidebarHeader>
      <SidebarContent>
        {isMobile && <MobileNavSwitcher />}
        <NavMain items={navItems} />
        <div className="flex-1" />
        {/* Hidden for v4-upgrade users only: the "Update" nav entry is trialled
            in this slot. Everyone else keeps the notifications stack. */}
        {!v4UpgradeUiEnabled && (
          <div className="flex flex-col gap-2 p-2">
            <SidebarNotifications />
          </div>
        )}
        <NavMain items={secondaryNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser {...userNavProps} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

const DemoBadge = () => {
  const router = useRouter();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const routerProjectId = router.query.projectId as string | undefined;

  if (
    !(
      env.NEXT_PUBLIC_DEMO_ORG_ID &&
      env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
      routerProjectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
      isLangfuseCloud
    )
  )
    return null;

  return (
    <SidebarGroup className="border-b">
      <SidebarGroupLabel>Demo Project (view only)</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Use Demo App to create traces"
              variant="cta"
            >
              <Link
                href="https://langfuse.com/docs/demo"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Use Demo App</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Your Langfuse Organizations">
              <Link href="/">
                <Grid2X2 className="h-4 w-4" />
                <span>Your Langfuse Orgs</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
