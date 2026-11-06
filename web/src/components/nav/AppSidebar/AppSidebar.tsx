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
import { type RouteGroup } from "@/src/components/layouts/routes";
import { ExternalLink, X } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { VERSION } from "@/src/constants/VERSION";
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
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import type { OrganizationDropdownMenu } from "@/src/components/OrganizationDropdownMenu/OrganizationDropdownMenu";
import { ProjectDropdownMenu } from "@/src/components/ProjectDropdownMenu/ProjectDropdownMenu";
import { assertUnreachable } from "@/src/utils/types";
import { SIDEBAR_NOTIFICATIONS, type SidebarNotification } from "./utils";
import { useOrgProjectSwitchPaths } from "@/src/features/projects/hooks";
import {
  APP_SHELL_CHROME_ROW_CLASS,
  APP_SHELL_CHROME_ROW_TEST_ID,
} from "@/src/components/layouts/app-shell-chrome";
import { cn } from "@/src/utils/tailwind";
import {
  type SidebarVersionState,
  VersionLabel,
} from "@/src/components/nav/VersionLabel/VersionLabel";
import { OrganizationSwitcher } from "@/src/components/nav/OrganizationSwitcher/OrganizationSwitcher";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

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
  /** Defaults to the build's VERSION. */
  version?: string;
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
  version = VERSION,
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
        <div
          data-testid={APP_SHELL_CHROME_ROW_TEST_ID}
          className={cn(
            APP_SHELL_CHROME_ROW_CLASS,
            "min-w-0 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          )}
        >
          <OrganizationSwitcher
            organization={organization}
            organizations={organizations}
            canCreateOrganizations={canCreateOrganizations}
            logo={logo}
          />
        </div>
        {showDemoBadge && <DemoBadge />}
      </SidebarHeader>
      <SidebarContent>
        {isMobile && organization && project && (
          <MobileProjectSwitcher
            organizationId={organization.id}
            project={project}
            organizations={organizations}
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
        <NavMain
          items={withVersionLabel(secondaryNavItems, versionState, version)}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} items={userMenuItems} isMobile={isMobile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Puts the version label on the right of the Support row. */
function withVersionLabel(
  items: AppSidebarProps["secondaryNavItems"],
  versionState: SidebarVersionState,
  version: string,
): AppSidebarProps["secondaryNavItems"] {
  return {
    ...items,
    ungrouped: items.ungrouped.map((item) =>
      item.id === "support"
        ? {
            ...item,
            menuNode: (
              <>
                {item.menuNode}
                <div className="absolute top-1/2 right-1 flex -translate-y-1/2 group-data-[collapsible=icon]:hidden">
                  <VersionLabel state={versionState} version={version} />
                </div>
              </>
            ),
          }
        : item,
    ),
  };
}

function MobileProjectSwitcher({
  organizationId,
  project,
  organizations,
  canCreateProjects,
}: {
  organizationId: string;
  project: { id: string; name: string };
  organizations: OrganizationOption[] | null;
  canCreateProjects: boolean;
}) {
  const { getProjectPath } = useOrgProjectSwitchPaths();

  return (
    <SidebarGroup className="border-b">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <ProjectDropdownMenu
              organizationId={organizationId}
              {...(organizations
                ? {
                    state: "loaded",
                    projects:
                      organizations.find((item) => item.id === organizationId)
                        ?.projects ?? [],
                  }
                : { state: "loading" })}
              canCreateProjects={canCreateProjects}
              getProjectPath={getProjectPath}
            >
              {({ getTriggerProps }) => (
                <SidebarMenuButton {...getTriggerProps()}>
                  <span
                    className="ph-no-capture min-w-0 flex-1 truncate text-left"
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
            <X size="base" color="default" />
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
            <DropdownMenuGroup>{items.map(renderMenuItem)}</DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const DemoBadge = () => {
  return (
    <SidebarGroup spacing="flushTop" className="border-b">
      <SidebarGroupLabel>Demo project (view only)</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Use demo app to create traces"
              variant="cta"
            >
              <Link
                href="https://langfuse.com/docs/demo"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size="base" />
                <span>Use demo app</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
