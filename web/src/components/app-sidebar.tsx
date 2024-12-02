"use client";

import * as React from "react";
import { NavMain, type NavMainItem } from "@/src/components/nav-main";
import { NavUser, type UserNavigationProps } from "@/src/components/nav-user";
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
import { SidebarNotifications } from "@/src/components/sidebar-notifications";
import { UsageTracker } from "@/src/ee/features/billing/components/UsageTracker";

type AppSidebarProps = {
  navItems: NavMainItem[];
  secondaryNavItems: NavMainItem[];
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
        <div className="flex items-center gap-2 p-2 pr-0">
          <LangfuseLogo version />
        </div>
        <DemoBadge />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <div className="flex-1" />
        <div className="flex flex-col gap-2 p-2">
          <UsageTracker />
          <SidebarNotifications />
        </div>
        <NavMain items={secondaryNavItems} showFeedbackButton />
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
  ) : null;
};
