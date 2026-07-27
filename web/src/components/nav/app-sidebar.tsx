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
import { LangfuseLogo } from "@/src/components/design-system/LangfuseLogo/LangfuseLogo";
import { MobileNavSwitcher } from "@/src/components/nav/mobile-nav-switcher";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { type RouteGroup } from "@/src/components/layouts/routes";
import {
  ArrowUp,
  ArrowUp10,
  BadgeCheck,
  ExternalLink,
  Grid2X2,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
} from "lucide-react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { SiGithub } from "react-icons/si";
import { VERSION } from "@/src/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { usePlan } from "@/src/features/entitlements/hooks";
import { isSelfHostedPlan, planLabels } from "@langfuse/shared";
import { StatusBadge } from "@/src/components/layouts/status-badge";

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
  const uiCustomization = useUiCustomization();

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <div className="flex min-h-9 items-center gap-2 py-2 pr-0 pl-2 group-data-[collapsible=icon]:p-3">
          <div className="-mt-2 ml-1 flex flex-wrap gap-4 lg:flex-col lg:items-start">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <LangfuseLogo
                  logoLightModeHref={uiCustomization?.logoLightModeHref}
                  logoDarkModeHref={uiCustomization?.logoDarkModeHref}
                />
              </Link>
              <VersionLabel className="ml-2 group-data-[collapsible=icon]:hidden" />
            </div>
          </div>
        </div>
        <div className="h-1 flex-1 border-b" />
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

const VersionLabel = ({ className }: { className?: string }) => {
  const { isLangfuseCloud } = useLangfuseCloudRegion();

  const backgroundMigrationStatus = api.backgroundMigrations.status.useQuery(
    undefined,
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !isLangfuseCloud, // do not check for updates on Langfuse Cloud
      throwOnError: false, // do not render default error message
    },
  );

  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !isLangfuseCloud, // do not check for updates on Langfuse Cloud
    throwOnError: false, // do not render default error message
  });

  const plan = usePlan();

  const selfHostedPlanLabel = !isLangfuseCloud
    ? plan && isSelfHostedPlan(plan)
      ? // self-host plan
        // TODO: clean up to use planLabels in packages/shared/src/features/entitlements/plans.ts
        {
          short: plan === "self-hosted:pro" ? "Pro" : "EE",
          long: planLabels[plan],
        }
      : // no plan, oss
        {
          short: "OSS",
          long: "Open Source",
        }
    : // null on cloud
      null;

  const showBackgroundMigrationStatus =
    !isLangfuseCloud &&
    backgroundMigrationStatus.data &&
    backgroundMigrationStatus.data.status !== "FINISHED";

  const hasUpdate =
    !isLangfuseCloud && checkUpdate.data && checkUpdate.data.updateType;

  const color =
    checkUpdate.data?.updateType === "major"
      ? "text-dark-red"
      : checkUpdate.data?.updateType === "minor"
        ? "text-dark-yellow"
        : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn("mt-[0.2px] text-[0.625rem]", className)}
        >
          {VERSION}
          {selfHostedPlanLabel ? <> {selfHostedPlanLabel.short}</> : null}
          {showBackgroundMigrationStatus && (
            <StatusBadge
              type={backgroundMigrationStatus.data?.status.toLowerCase()}
              showText={false}
              className="bg-transparent"
            />
          )}
          {hasUpdate && !showBackgroundMigrationStatus && (
            <ArrowUp className={`h-3 w-3 ${color}`} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {hasUpdate ? (
          <>
            <DropdownMenuLabel>
              New {checkUpdate.data?.updateType} version:{" "}
              {checkUpdate.data?.latestRelease}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : !isLangfuseCloud ? (
          <>
            <DropdownMenuLabel>This is the latest release</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {selfHostedPlanLabel && (
          <>
            <DropdownMenuLabel className="flex items-center font-normal">
              <BadgeCheck size={16} className="mr-2" />
              {selfHostedPlanLabel.long}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link
            href="https://github.com/langfuse/langfuse/releases"
            target="_blank"
          >
            <SiGithub size={16} className="mr-2" />
            Releases
          </Link>
        </DropdownMenuItem>
        {!isLangfuseCloud && (
          <DropdownMenuItem asChild>
            <Link href="/background-migrations">
              <ArrowUp10 size={16} className="mr-2" />
              Background Migrations
              {showBackgroundMigrationStatus && (
                <StatusBadge
                  type={backgroundMigrationStatus.data?.status.toLowerCase()}
                  showText={false}
                  className="bg-transparent"
                />
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/changelog" target="_blank">
            <Newspaper size={16} className="mr-2" />
            Changelog
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/roadmap" target="_blank">
            <Map size={16} className="mr-2" />
            Roadmap
          </Link>
        </DropdownMenuItem>
        {!isLangfuseCloud && (
          <DropdownMenuItem asChild>
            <Link href="https://langfuse.com/pricing-self-host" target="_blank">
              <Info size={16} className="mr-2" />
              Compare Versions
            </Link>
          </DropdownMenuItem>
        )}
        {hasUpdate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="https://langfuse.com/docs/deployment/self-host#update"
                target="_blank"
              >
                <HardDriveDownload size={16} className="mr-2" />
                Update
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
