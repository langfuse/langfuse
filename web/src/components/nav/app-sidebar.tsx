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
      <SidebarHeader>
        <div className="flex min-h-10 items-center gap-2 px-3 py-2">
          <LangfuseLogo version />
        </div>
        <div className="h-1 flex-1 border-b" />
        <DemoBadge />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <div className="flex-1" />
        <div className="flex flex-col gap-2 p-2">
          <SidebarNotifications />
        </div>
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
    <SidebarGroup className="mb-1 border-b">
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
