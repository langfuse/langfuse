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
} from "@/src/components/ui/sidebar";
import { env } from "@/src/env.mjs";
import { useRouter } from "next/router";
import Link from "next/link";
import { LangfuseLogo } from "@/src/components/LangfuseLogo";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { type RouteGroup } from "@/src/components/layouts/routes";
import { ExternalLink, Grid2X2 } from "lucide-react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

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
  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader className="border-sidebar-border/70 border-b">
        <div className="flex min-h-9 items-center gap-2 py-3 pr-0 pl-3 group-data-[collapsible=icon]:p-3">
          <LangfuseLogo version />
        </div>
        <DemoBadge />
      </SidebarHeader>
      <SidebarContent className="pb-2">
        <NavMain items={navItems} />
        <div className="flex-1" />
        <div className="border-sidebar-border/70 mt-2 border-t pt-2 group-data-[collapsible=icon]:border-t-0 group-data-[collapsible=icon]:pt-0">
          <NavMain items={secondaryNavItems} />
          <SidebarNotifications />
        </div>
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border/70 border-t px-2 pt-2 pb-2">
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
    <SidebarGroup className="mx-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-2 py-2 text-amber-950 group-data-[collapsible=icon]:hidden dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100">
      <SidebarGroupLabel className="mb-1 h-auto px-0 text-amber-900/70 dark:text-amber-100/70">
        Demo Project (view only)
      </SidebarGroupLabel>
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
