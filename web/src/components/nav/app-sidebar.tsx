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
  SidebarHeader,
  SidebarRail,
} from "@/src/components/ui/sidebar";
import { env } from "@/src/env.mjs";
import { useRouter } from "next/router";
import Link from "next/link";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { LangfuseLogo } from "@/src/components/LangfuseLogo";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { UsageTracker } from "@/src/ee/features/billing/components/UsageTracker";
import { type RouteGroup } from "@/src/components/layouts/routes";

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
          <UsageTracker />
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
  const routerProjectId = router.query.projectId as string | undefined;

  return env.NEXT_PUBLIC_DEMO_ORG_ID &&
    env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
    routerProjectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) ? (
    <div className="flex border-b px-3 py-2">
      <Alert className="rounded-md bg-light-yellow group-data-[collapsible=icon]:hidden">
        <AlertDescription className="overflow-hidden text-ellipsis whitespace-nowrap text-xs">
          View-only{" "}
          <Link
            href="https://langfuse.com/docs/demo"
            target="_blank"
            className="underline"
          >
            demo project
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  ) : null;
};
