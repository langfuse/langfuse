/* eslint-disable no-nested-ternary, @typescript-eslint/no-use-before-define */
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
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { type RouteGroup } from "@/src/components/layouts/routes";
import {
  ArrowUp10,
  BadgeCheck,
  ExternalLink,
  Grid2X2,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
  X,
} from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SiGithub } from "@langfuse/icons/si";
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
import { isCloudPlan, planLabels, type Plan } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { env } from "@/src/env.mjs";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
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
import { nextCompactPlanBadge } from "./compactPlanBadge";
import { SIDEBAR_NOTIFICATIONS, type SidebarNotification } from "./utils";
import { useOrgProjectSwitchPaths } from "@/src/features/projects/hooks";
import {
  APP_SHELL_CHROME_ROW_CLASS,
  APP_SHELL_CHROME_ROW_TEST_ID,
} from "@/src/components/layouts/app-shell-chrome";
import { cn } from "@/src/utils/tailwind";

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
  oss: { short: "OSS", long: "Open source" },
  "self-hosted:pro": {
    short: "Pro",
    long: planLabels["self-hosted:pro"],
  },
  "self-hosted:enterprise": {
    short: "EE",
    long: planLabels["self-hosted:enterprise"],
  },
  "self-hosted:gov": {
    short: "Gov",
    long: planLabels["self-hosted:gov"],
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
            "min-w-0 gap-1.5 pr-2 pl-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          )}
        >
          {organization && !isMobile && (
            <>
              <Link
                href={`/organization/${organization.id}`}
                aria-label={`${organization.name} projects`}
                className="ph-no-capture relative z-10 -ml-1 flex shrink-0 items-center group-data-[collapsible=icon]:ml-0"
              >
                {logo.lightModeHref && logo.darkModeHref ? (
                  <>
                    <img
                      src={logo.lightModeHref}
                      alt="Logo"
                      className="mr-1 size-7 object-contain group-data-[collapsible=icon]:mr-0 dark:hidden"
                    />
                    <img
                      src={logo.darkModeHref}
                      alt="Logo"
                      className="mr-1 hidden size-7 object-contain group-data-[collapsible=icon]:mr-0 dark:block"
                    />
                  </>
                ) : (
                  <LangfuseIcon size={24} />
                )}
              </Link>
              <SidebarOrganizationSwitcher
                organization={organization}
                organizations={organizations}
                canCreateOrganizations={canCreateOrganizations}
              />
            </>
          )}
          {!(organization && !isMobile) && (
            <Link href="/" className="flex items-center">
              <LangfuseLogo
                logoLightModeHref={logo.lightModeHref}
                logoDarkModeHref={logo.darkModeHref}
              />
            </Link>
          )}
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
        <NavUser
          user={user}
          items={userMenuItems}
          isMobile={isMobile}
          versionState={versionState}
          version={version}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** Plans whose badge has a shorter form for when the full one would truncate the org name. */
const SHORT_PLAN_LABELS: Partial<Record<Plan, string>> = {
  "cloud:enterprise": "ENT",
};

/**
 * Switches the plan badge to its short label while the full one would
 * truncate the org name, and back once there is room for it again.
 */
function useCompactPlanBadge(hasShortLabel: boolean, name: string) {
  const nameRef = React.useRef<HTMLSpanElement>(null);
  const badgeRef = React.useRef<HTMLSpanElement>(null);
  const chevronRef = React.useRef<HTMLSpanElement>(null);
  const fullBadgeWidth = React.useRef(0);
  const compactRef = React.useRef(false);
  const [compact, setCompact] = React.useState(false);

  React.useLayoutEffect(() => {
    const nameEl = nameRef.current;
    const badgeEl = badgeRef.current;
    const chevronEl = chevronRef.current;
    if (!hasShortLabel || !nameEl || !badgeEl || !chevronEl) {
      if (compactRef.current) {
        compactRef.current = false;
        setCompact(false);
      }
      return;
    }
    const update = () => {
      const parent = nameEl.parentElement;
      const gapPx = parent
        ? Number.parseFloat(getComputedStyle(parent).columnGap) || 0
        : 0;
      const freeSpace =
        chevronEl.getBoundingClientRect().left -
        badgeEl.getBoundingClientRect().right;
      const next = nextCompactPlanBadge({
        compact: compactRef.current,
        nameScrollWidth: nameEl.scrollWidth,
        nameClientWidth: nameEl.clientWidth,
        freeSpace,
        fullBadgeWidth: fullBadgeWidth.current,
        currentBadgeWidth: badgeEl.offsetWidth,
        gapPx,
      });
      if (next === compactRef.current) return;
      // Record the full badge before the short label replaces it.
      if (!compactRef.current) fullBadgeWidth.current = badgeEl.offsetWidth;
      compactRef.current = next;
      setCompact(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nameEl);
    if (nameEl.parentElement) observer.observe(nameEl.parentElement);
    return () => observer.disconnect();
  }, [hasShortLabel, name]);

  return { nameRef, badgeRef, chevronRef, compact };
}

function SidebarOrganizationSwitcher({
  organization,
  organizations,
  canCreateOrganizations,
}: {
  organization: { id: string; name: string };
  organizations: OrganizationOption[] | null;
  canCreateOrganizations: boolean;
}) {
  const { getOrgPath } = useOrgProjectSwitchPaths();
  const plan = organizations?.find((org) => org.id === organization.id)?.plan;
  const showPlan =
    plan !== undefined &&
    isCloudPlan(plan) &&
    organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID;
  const shortPlanLabel = plan ? SHORT_PLAN_LABELS[plan] : undefined;
  const { nameRef, badgeRef, chevronRef, compact } = useCompactPlanBadge(
    shortPlanLabel !== undefined,
    organization.name,
  );

  return (
    <div className="flex min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
      <OrganizationDropdownMenu
        {...(organizations
          ? { state: "loaded", organizations }
          : { state: "loading" })}
        canCreateOrganizations={canCreateOrganizations}
        getOrgPath={getOrgPath}
        currentOrganizationId={organization.id}
      >
        {({ getTriggerProps }) => (
          <button
            type="button"
            className="text-primary -ml-3.5 flex h-6 min-w-0 flex-1 items-center gap-1.5 py-0 pr-2 pl-3 text-sm"
            {...getTriggerProps()}
          >
            <span
              ref={nameRef}
              className="ph-no-capture min-w-0 truncate py-0.5 leading-none font-medium"
              title={organization.name}
            >
              {organization.name}
            </span>
            {plan && showPlan && (
              <span ref={badgeRef} className="flex shrink-0">
                <Badge
                  color="filled"
                  size="sm"
                  text={
                    compact && shortPlanLabel
                      ? shortPlanLabel
                      : planLabels[plan].toUpperCase()
                  }
                />
              </span>
            )}
            <span ref={chevronRef} className="ml-auto flex shrink-0">
              <DropdownIndicator direction="up-down" size="sm" color="muted" />
            </span>
          </button>
        )}
      </OrganizationDropdownMenu>
    </div>
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
              currentOrganizationId={organization.id}
            >
              {({ getTriggerProps }) => (
                <SidebarMenuButton {...getTriggerProps()}>
                  <span
                    className="ph-no-capture min-w-0 flex-1 truncate text-left"
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
                currentProjectId={project.id}
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
  versionState,
  version,
}: {
  user: SidebarUser;
  items: UserNavigationItem[];
  isMobile: boolean;
  versionState: SidebarVersionState;
  version: string;
}) {
  const versionDetails = getVersionDetails(versionState, version);
  const versionStatusDot = getVersionStatusDot(versionDetails);

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
                <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                  <span className="truncate" title={versionDetails.text}>
                    {versionDetails.text}
                  </span>
                  {versionStatusDot && <AttentionDot {...versionStatusDot} />}
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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span className="flex items-center gap-1.5">
                  {versionDetails.text}
                  {versionStatusDot && <AttentionDot {...versionStatusDot} />}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <VersionMenuItems
                  state={versionState}
                  details={versionDetails}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Your Langfuse organizations">
              <Link href="/">
                <Grid2X2 size="base" />
                <span>Your Langfuse orgs</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

const attentionDotTones = {
  major: "bg-dark-red",
  minor: "bg-category-amber",
  patch: "bg-muted-foreground",
  migration: "bg-dark-blue",
} as const;

const AttentionDot = ({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof attentionDotTones;
}) => (
  <span
    role="img"
    aria-label={label}
    title={label}
    className={cn("size-1.5 shrink-0 rounded-full", attentionDotTones[tone])}
  />
);

type VersionDetails = {
  text: string;
  selfHostedPlanLabel: { short: string; long: string } | null;
  backgroundMigrationStatus: string | null;
  update: {
    updateType: "major" | "minor" | "patch";
    latestRelease: string;
  } | null;
};

const getVersionDetails = (
  state: SidebarVersionState,
  version: string,
): VersionDetails => {
  const selfHostedPlanLabel =
    state.deployment === "self-hosted"
      ? selfHostedPlanLabels[state.plan]
      : null;
  return {
    text: `${version}${selfHostedPlanLabel ? ` ${selfHostedPlanLabel.short}` : ""}`,
    selfHostedPlanLabel,
    backgroundMigrationStatus:
      state.deployment === "self-hosted" &&
      state.migration.status === "in-progress"
        ? state.migration.phase
        : null,
    update:
      state.deployment === "self-hosted" &&
      state.release.status === "update-available"
        ? state.release
        : null,
  };
};

const getVersionStatusDot = (
  details: VersionDetails,
): React.ComponentProps<typeof AttentionDot> | null => {
  const { update, backgroundMigrationStatus } = details;
  if (backgroundMigrationStatus) {
    return { label: "Background migration running", tone: "migration" };
  }
  if (update) {
    return {
      label: `New ${update.updateType} version available`,
      tone: update.updateType,
    };
  }
  return null;
};

const VersionMenuItems = ({
  state,
  details,
}: {
  state: SidebarVersionState;
  details: VersionDetails;
}) => {
  const { selfHostedPlanLabel, backgroundMigrationStatus, update } = details;

  return (
    <>
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
            <BadgeCheck size="base" __rawClassName="mr-2" />
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
          <SiGithub size="base" color="default" __rawClassName="mr-2" />
          Releases
        </Link>
      </DropdownMenuItem>
      {state.deployment === "self-hosted" && (
        <DropdownMenuItem asChild>
          <Link href="/background-migrations">
            <ArrowUp10 size="base" color="default" __rawClassName="mr-2" />
            Background migrations
            {backgroundMigrationStatus && (
              <span className="ml-2 inline-flex">
                <AttentionDot
                  label="Background migration running"
                  tone="migration"
                />
              </span>
            )}
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem asChild>
        <Link href="https://langfuse.com/changelog" target="_blank">
          <Newspaper size="base" color="default" __rawClassName="mr-2" />
          Changelog
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="https://langfuse.com/roadmap" target="_blank">
          <Map size="base" color="default" __rawClassName="mr-2" />
          Roadmap
        </Link>
      </DropdownMenuItem>
      {state.deployment === "self-hosted" && (
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/pricing-self-host" target="_blank">
            <Info size="base" color="default" __rawClassName="mr-2" />
            Compare versions
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
              <HardDriveDownload
                size="base"
                color="default"
                __rawClassName="mr-2"
              />
              Update
              {!backgroundMigrationStatus && (
                <span className="ml-2 inline-flex">
                  <AttentionDot
                    label="Update available"
                    tone={update.updateType}
                  />
                </span>
              )}
            </Link>
          </DropdownMenuItem>
        </>
      )}
    </>
  );
};
