"use client";

import * as React from "react";
import { NavMain, type NavMainItem } from "@/src/components/nav/nav-main";
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
  ChevronsUpDown,
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { planLabels, type Plan } from "@langfuse/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";

type SelfHostedPlan = Extract<Plan, "oss" | `self-hosted:${string}`>;

type SidebarVersionState =
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

type UserNavigationItem = {
  name: string;
  onClick?: () => void;
  content?: React.ReactNode;
  href?: string;
  subItems?: UserNavigationItem[];
};

type SidebarUser = {
  name: string;
  email: string;
  avatar: string;
};

type AppSidebarProps = {
  navItems: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
  secondaryNavItems: {
    grouped: Partial<Record<RouteGroup, NavMainItem[]>> | null;
    ungrouped: NavMainItem[];
  };
  user: SidebarUser;
  userMenuItems: UserNavigationItem[];
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
  user,
  userMenuItems,
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
        <div className="flex min-h-9 min-w-0 items-center py-2 pr-2 pl-3 group-data-[collapsible=icon]:p-3">
          <Link href="/" className="flex shrink-0 items-center">
            <LangfuseLogo
              logoLightModeHref={logoLightModeHref}
              logoDarkModeHref={logoDarkModeHref}
            />
          </Link>
          <div className="ml-auto flex min-w-0 items-center overflow-hidden pl-2 group-data-[collapsible=icon]:hidden">
            <VersionLabel state={versionState} />
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
        <NavUser user={user} items={userMenuItems} isMobile={isMobile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavUser({
  user,
  items,
  isMobile,
}: {
  user: SidebarUser;
  items: UserNavigationItem[];
  isMobile: boolean;
}) {
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  const renderMenuItem = (item: UserNavigationItem) => {
    if (item.subItems?.length) {
      return (
        <DropdownMenuSub key={item.name}>
          <DropdownMenuSubTrigger>
            {item.content ?? item.name}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {item.subItems.map(renderMenuItem)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    if (item.href) {
      return (
        <DropdownMenuItem key={item.name} asChild>
          <Link href={item.href}>{item.content ?? item.name}</Link>
        </DropdownMenuItem>
      );
    }

    return (
      <DropdownMenuItem key={item.name} onClick={item.onClick}>
        {item.content ?? item.name}
      </DropdownMenuItem>
    );
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold" title={user.name}>
                  {user.name}
                </span>
                <span className="truncate text-xs" title={user.email}>
                  {user.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold" title={user.name}>
                    {user.name}
                  </span>
                  <span className="truncate text-xs" title={user.email}>
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>{items.map(renderMenuItem)}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
  const versionText = `${VERSION}${
    selfHostedPlanLabel ? ` ${selfHostedPlanLabel.short}` : ""
  }`;
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
          className="h-5 max-w-full min-w-0 py-0.5 text-[0.625rem]"
        >
          <span className="truncate" title={versionText}>
            {versionText}
          </span>
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
