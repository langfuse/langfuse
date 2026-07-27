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
import Link from "next/link";
import { LangfuseLogo } from "@/src/components/design-system/LangfuseLogo/LangfuseLogo";
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
import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { planLabels, type Plan } from "@langfuse/shared";

type SelfHostedPlan = Extract<Plan, "oss" | `self-hosted:${string}`>;

export type SidebarVersionState =
  | { deployment: "cloud" }
  | {
      deployment: "self-hosted";
      plan: SelfHostedPlan;
      release:
        | { status: "current" }
        | {
            status: "update-available";
            updateType: string;
            latestRelease: string;
          };
      migration: { status: "idle" } | { status: "in-progress"; phase: string };
    };

const selfHostedPlanLabels = {
  oss: { short: "OSS", long: "Open Source" },
  "self-hosted:pro": {
    short: "Pro",
    long: planLabels["self-hosted:pro"],
  },
  "self-hosted:enterprise": {
    short: "EE",
    long: planLabels["self-hosted:enterprise"],
  },
} satisfies Record<SelfHostedPlan, { short: string; long: string }>;

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
  isMobile: boolean;
  logoLightModeHref?: string;
  logoDarkModeHref?: string;
  versionState: SidebarVersionState;
  showDemoBadge: boolean;
  mobileNavSwitcher?: React.ReactNode;
  notifications?: React.ReactNode;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  navItems,
  secondaryNavItems,
  userNavProps,
  isMobile,
  logoLightModeHref,
  logoDarkModeHref,
  versionState,
  showDemoBadge,
  mobileNavSwitcher,
  notifications,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      <SidebarHeader>
        <div className="flex min-h-9 items-center gap-2 py-2 pr-0 pl-2 group-data-[collapsible=icon]:p-3">
          <div className="-mt-2 ml-1 flex flex-wrap gap-4 lg:flex-col lg:items-start">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <LangfuseLogo
                  logoLightModeHref={logoLightModeHref}
                  logoDarkModeHref={logoDarkModeHref}
                />
              </Link>
              <div className="ml-2 group-data-[collapsible=icon]:hidden">
                <VersionLabel state={versionState} />
              </div>
            </div>
          </div>
        </div>
        <div className="h-1 flex-1 border-b" />
        <DemoBadge show={showDemoBadge} />
      </SidebarHeader>
      <SidebarContent>
        {isMobile && mobileNavSwitcher}
        <NavMain items={navItems} />
        <div className="flex-1" />
        {notifications && (
          <div className="flex flex-col gap-2 p-2">{notifications}</div>
        )}
        <NavMain items={secondaryNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser {...userNavProps} isMobile={isMobile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

const DemoBadge = ({ show }: { show: boolean }) => {
  if (!show) return null;

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

const VersionLabel = ({ state }: { state: SidebarVersionState }) => {
  const selfHostedPlanLabel =
    state.deployment === "self-hosted"
      ? selfHostedPlanLabels[state.plan]
      : null;
  const backgroundMigrationStatus =
    state.deployment === "self-hosted" &&
    state.migration.status === "in-progress"
      ? state.migration.phase
      : null;
  const update =
    state.deployment === "self-hosted" &&
    state.release.status === "update-available"
      ? state.release
      : null;
  const color =
    update?.updateType === "major"
      ? "text-dark-red"
      : update?.updateType === "minor"
        ? "text-dark-yellow"
        : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="mt-[0.2px] text-[0.625rem]"
        >
          {VERSION}
          {selfHostedPlanLabel ? <> {selfHostedPlanLabel.short}</> : null}
          {backgroundMigrationStatus && (
            <StatusBadge
              type={backgroundMigrationStatus}
              showText={false}
              className="bg-transparent"
            />
          )}
          {update && !backgroundMigrationStatus && (
            <ArrowUp className={`h-3 w-3 ${color}`} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {update ? (
          <>
            <DropdownMenuLabel>
              New {update.updateType} version: {update.latestRelease}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : state.deployment === "self-hosted" ? (
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
        {state.deployment === "self-hosted" && (
          <DropdownMenuItem asChild>
            <Link href="/background-migrations">
              <ArrowUp10 size={16} className="mr-2" />
              Background Migrations
              {backgroundMigrationStatus && (
                <StatusBadge
                  type={backgroundMigrationStatus}
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
        {state.deployment === "self-hosted" && (
          <DropdownMenuItem asChild>
            <Link href="https://langfuse.com/pricing-self-host" target="_blank">
              <Info size={16} className="mr-2" />
              Compare Versions
            </Link>
          </DropdownMenuItem>
        )}
        {update && (
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
