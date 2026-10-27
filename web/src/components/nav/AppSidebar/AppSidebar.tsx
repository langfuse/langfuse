/* eslint-disable @typescript-eslint/no-use-before-define */
"use client";

import * as React from "react";
import { NavMain, type NavMainItem } from "@/src/components/nav/NavMain";
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
import { ExternalLink, Grid2X2 } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import {
  SidebarNotifications,
  getActiveSidebarNotifications,
  type SidebarNotificationState,
} from "@/src/components/nav/SidebarNotifications";
import { VersionBadge } from "@/src/components/nav/VersionBadge";
import { VersionMenu } from "@/src/components/nav/VersionMenu";
import { type SidebarVersionState } from "@/src/components/nav/versionState";
import {
  UserMenuItems,
  type UserNavigationItem,
} from "@/src/components/nav/UserMenuItems";
import { useOrgProjectSwitchPaths } from "@/src/features/projects";
import {
  APP_SHELL_CHROME_ROW_CLASS,
  APP_SHELL_CHROME_ROW_TEST_ID,
} from "@/src/components/layouts/app-shell-chrome";
import { cn } from "@/src/utils/tailwind";

type SidebarUser = {
  name: string;
  email: string;
  avatar: string;
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
    ? getActiveSidebarNotifications(notificationState.dismissedIds)
    : [];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <div
          data-testid={APP_SHELL_CHROME_ROW_TEST_ID}
          className={cn(
            APP_SHELL_CHROME_ROW_CLASS,
            "min-w-0 gap-2 pr-3 pl-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          )}
        >
          <Link href="/" className="flex items-center">
            <LangfuseLogo
              logoLightModeHref={logo.lightModeHref}
              logoDarkModeHref={logo.darkModeHref}
            />
          </Link>
          <div className="ml-auto flex min-w-0 items-center overflow-hidden group-data-[collapsible=icon]:hidden">
            <VersionMenu state={versionState}>
              {({ Trigger, triggerProps }) => (
                <Trigger asChild>
                  <VersionBadge state={versionState} {...triggerProps} />
                </Trigger>
              )}
            </VersionMenu>
          </div>
        </div>
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
            <OrganizationDropdownMenu
              {...(organizations
                ? { state: "loaded", organizations }
                : { state: "loading" })}
              canCreateOrganizations={canCreateOrganizations}
              getOrgPath={getOrgPath}
            >
              {({ getTriggerProps }) => (
                <SidebarMenuButton {...getTriggerProps()}>
                  <span
                    className="min-w-0 flex-1 truncate text-left"
                    title={organization.name}
                  >
                    {organization.name}
                  </span>
                  <span className="ml-auto flex shrink-0">
                    <DropdownIndicator />
                  </span>
                </SidebarMenuButton>
              )}
            </OrganizationDropdownMenu>
          </SidebarMenuItem>
          {project && (
            <SidebarMenuItem>
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
              >
                {({ getTriggerProps }) => (
                  <SidebarMenuButton {...getTriggerProps()}>
                    <span
                      className="min-w-0 flex-1 truncate text-left"
                      title={project.name}
                    >
                      {project.name}
                    </span>
                    <span className="ml-auto flex shrink-0">
                      <DropdownIndicator />
                    </span>
                  </SidebarMenuButton>
                )}
              </ProjectDropdownMenu>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar
                size="md"
                shape="rounded"
                src={user.avatar}
                displayName={user.name}
                email={user.email}
              />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold" title={user.name}>
                  {user.name}
                </span>
                <span className="truncate text-xs" title={user.email}>
                  {user.email}
                </span>
              </div>
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
                <Avatar
                  size="md"
                  shape="rounded"
                  src={user.avatar}
                  displayName={user.name}
                  email={user.email}
                />
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
            <DropdownMenuGroup>
              <UserMenuItems items={items} />
            </DropdownMenuGroup>
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
                <ExternalLink size="base" />
                <span>Use Demo App</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Your Langfuse Organizations">
              <Link href="/organizations">
                <Grid2X2 size="base" />
                <span>Your Langfuse Orgs</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
