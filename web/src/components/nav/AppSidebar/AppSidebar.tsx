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
  ChevronDownIcon,
  ExternalLink,
  Grid2X2,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
  X,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import { assertUnreachable } from "@/src/utils/types";
import { SIDEBAR_NOTIFICATIONS, type SidebarNotification } from "./utils";
import { useOrgProjectSwitchPaths } from "@/src/features/projects/hooks";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

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
            updateType: "major" | "minor" | "patch";
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

type UserNavigationItemBase = {
  name: string;
  content?: React.ReactNode;
};

type UserNavigationLeafItem =
  | (UserNavigationItemBase & {
      type: "action";
      onClick: () => void;
    })
  | (UserNavigationItemBase & {
      type: "link";
      href: string;
    });

type UserNavigationItem =
  | UserNavigationLeafItem
  | (UserNavigationItemBase & {
      type: "submenu";
      subItems: UserNavigationLeafItem[];
    });

type SidebarUser = {
  name: string;
  email: string;
  avatar: string;
};

type SidebarNotificationState = {
  dismissedIds: string[];
  onDismiss: (id: string) => void;
  onLinkClick: (id: string) => void;
};

type OrganizationDropdownOption = Extract<
  React.ComponentProps<typeof OrganizationDropdownMenu>,
  { state: "loaded" }
>["organizations"][number];

type ProjectOption = Extract<
  React.ComponentProps<typeof ProjectDropdownMenu>,
  { state: "loaded" }
>["projects"][number];

type OrganizationOption = OrganizationDropdownOption & {
  projects: ProjectOption[];
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
  logo: {
    lightModeHref?: string;
    darkModeHref?: string;
  };
  versionState: SidebarVersionState;
  showDemoBadge: boolean;
  v4UpgradeUiEnabled: boolean;
  notificationState: SidebarNotificationState;
  organization: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  organizations: OrganizationOption[] | null;
  canCreateOrganizations: boolean;
  canCreateProjects: boolean;
};

export function AppSidebar({
  navItems,
  secondaryNavItems,
  user,
  userMenuItems,
  isMobile,
  logo,
  versionState,
  showDemoBadge,
  v4UpgradeUiEnabled,
  notificationState,
  organization,
  project,
  organizations,
  canCreateOrganizations,
  canCreateProjects,
}: AppSidebarProps) {
  const activeNotifications = !v4UpgradeUiEnabled
    ? SIDEBAR_NOTIFICATIONS.filter((notification) => {
        if (notificationState.dismissedIds.includes(notification.id)) {
          return false;
        }
        if (!notification.createdAt) return true;

        const createdAt = new Date(notification.createdAt).getTime();
        return Date.now() <= createdAt + (notification.ttlMs ?? TWO_WEEKS_MS);
      })
    : [];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <div className="flex min-h-9 min-w-0 items-center py-2 pr-2 pl-3 group-data-[collapsible=icon]:p-3">
          <Link href="/" className="flex shrink-0 items-center">
            <LangfuseLogo
              logoLightModeHref={logo.lightModeHref}
              logoDarkModeHref={logo.darkModeHref}
            />
          </Link>
          <div className="ml-auto flex min-w-0 items-center overflow-hidden pl-2 group-data-[collapsible=icon]:hidden">
            <VersionLabel state={versionState} />
          </div>
        </div>
        <div className="h-1 flex-1 border-b" />
        {showDemoBadge && <DemoBadge />}
      </SidebarHeader>
      <SidebarContent>
        {isMobile && organization && (
          <MobileNavSwitcher
            organization={organization}
            project={project}
            organizations={organizations}
            canCreateOrganizations={canCreateOrganizations}
            canCreateProjects={canCreateProjects}
          />
        )}
        <NavMain items={navItems} />
        <div className="flex-1" />
        {activeNotifications.length > 0 && (
          <div className="flex flex-col gap-2 p-2">
            <SidebarNotifications
              state={notificationState}
              activeNotifications={activeNotifications}
            />
          </div>
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

function MobileNavSwitcher({
  organization,
  project,
  organizations,
  canCreateOrganizations,
  canCreateProjects,
}: {
  organization: { id: string; name: string };
  project: { id: string; name: string } | null;
  organizations: OrganizationOption[] | null;
  canCreateOrganizations: boolean;
  canCreateProjects: boolean;
}) {
  const { getProjectPath, getOrgPath } = useOrgProjectSwitchPaths();

  return (
    <SidebarGroup className="border-b">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <span
                    className="min-w-0 flex-1 truncate text-left"
                    title={organization.name}
                  >
                    {organization.name}
                  </span>
                  <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <OrganizationDropdownMenu
                {...(organizations
                  ? { state: "loaded", organizations }
                  : { state: "loading" })}
                canCreateOrganizations={canCreateOrganizations}
                getOrgPath={getOrgPath}
              />
            </DropdownMenu>
          </SidebarMenuItem>
          {project && (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton>
                    <span
                      className="min-w-0 flex-1 truncate text-left"
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <ProjectDropdownMenu
                  organizationId={organization.id}
                  {...(organizations
                    ? {
                        state: "loaded",
                        projects:
                          organizations.find(
                            (item) => item.id === organization.id,
                          )?.projects ?? [],
                      }
                    : { state: "loading" })}
                  canCreateProjects={canCreateProjects}
                  getProjectPath={getProjectPath}
                />
              </DropdownMenu>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarNotifications({
  state,
  activeNotifications,
}: {
  state: SidebarNotificationState;
  activeNotifications: SidebarNotification[];
}) {
  const visibleNotifications = activeNotifications.slice(0, 3);
  const frontNotification = visibleNotifications[0];
  const backCount = visibleNotifications.length - 1;
  const peekOffset = 8;
  const peekScaleStep = 0.05;

  return (
    <div
      className="group-data-[collapsible=icon]:hidden"
      style={{ paddingBottom: backCount * peekOffset + 2 }}
    >
      <div className="relative">
        {Array.from({ length: backCount }).map((_, index) => {
          const stackIndex = index + 1;
          return (
            <Card
              key={`stack-${stackIndex}`}
              aria-hidden
              className="bg-card pointer-events-none absolute inset-0 rounded-md shadow-none"
              style={{
                transform: `translateY(${stackIndex * peekOffset}px) scaleX(${
                  1 - stackIndex * peekScaleStep
                })`,
                transformOrigin: "top center",
                zIndex: visibleNotifications.length - stackIndex,
              }}
            />
          );
        })}
        <Card
          key={frontNotification.id}
          className="bg-card relative max-h-60 overflow-hidden rounded-md shadow-none"
          style={{ zIndex: visibleNotifications.length }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2.5 right-1.5 h-5 w-5 p-0"
            onClick={() => state.onDismiss(frontNotification.id)}
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <CardHeader className="px-3 pt-2.5 pr-6 pb-0">
            <CardTitle className="text-sm">{frontNotification.title}</CardTitle>
            <CardDescription className="mt-1">
              {frontNotification.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pt-1.5 pb-2.5">
            {frontNotification.link &&
              (frontNotification.linkImage ? (
                <Link
                  href={frontNotification.link}
                  target="_blank"
                  onClick={() => state.onLinkClick(frontNotification.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={frontNotification.linkImage.alt}
                    src={frontNotification.linkImage.src}
                  />
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  asChild
                >
                  <Link
                    href={frontNotification.link}
                    target="_blank"
                    onClick={() => state.onLinkClick(frontNotification.id)}
                  >
                    {frontNotification.linkTitle ?? "Learn more"} &rarr;
                  </Link>
                </Button>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
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
    if (item.type === "submenu") {
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

    if (item.type === "link") {
      return (
        <DropdownMenuItem key={item.name} asChild>
          <Link href={item.href}>{item.content ?? item.name}</Link>
        </DropdownMenuItem>
      );
    }

    if (item.type === "action") {
      return (
        <DropdownMenuItem key={item.name} onClick={item.onClick}>
          {item.content ?? item.name}
        </DropdownMenuItem>
      );
    }

    return assertUnreachable(item);
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

const DemoBadge = () => {
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
  const color = React.useMemo(() => {
    if (!update) return undefined;
    if (update.updateType === "major") return "text-dark-red";
    if (update.updateType === "minor") return "text-dark-yellow";
    if (update.updateType === "patch") return undefined;
    return assertUnreachable(update.updateType);
  }, [update]);

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
