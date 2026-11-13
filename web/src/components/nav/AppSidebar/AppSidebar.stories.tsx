/* eslint-disable @typescript-eslint/no-use-before-define */
import type { ComponentProps } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ListTree,
  Grid2X2,
  Box,
  Home,
  KeyRound,
  Search,
  Settings,
} from "@langfuse/icons";
import { expect, fn, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import {
  APP_SHELL_CHROME_ROW_CLASS,
  APP_SHELL_CHROME_ROW_TEST_ID,
} from "@/src/components/layouts/app-shell-chrome";
import { cn } from "@/src/utils/tailwind";

type AppSidebarProps = ComponentProps<typeof AppSidebar>;
type VersionState = AppSidebarProps["versionState"];
type NotificationState = AppSidebarProps["notificationState"];

const launchWeekNotificationIds = ["lw5-1", "lw5-2", "lw5-3", "lw5-4", "lw5-5"];
const duringLaunchWeek = new Date("2026-05-29T12:00:00Z").getTime();

const setCurrentTimestamp = (timestamp: number) => {
  const originalDateNow = Date.now;
  Date.now = () => timestamp;
  return () => {
    Date.now = originalDateNow;
  };
};

const meta = preview.meta({
  component: AppSidebar,
  // Fullscreen: the docked sidebar is `position: fixed` to the iframe, so
  // Storybook's default 1rem padded layout sat the inset chrome 16px below
  // the logo strip and made the T-junction look broken.
  parameters: { layout: "fullscreen" },
  render: (args) => <SidebarStory open args={args} />,
  args: {
    navItems: {
      ungrouped: [
        { title: "Home", url: "/", icon: Home, isActive: true },
        { title: "Traces", url: "/traces", icon: Activity },
        { title: "Prompts", url: "/prompts", icon: BookOpen },
      ],
      grouped: null,
    },
    secondaryNavItems: {
      ungrouped: [{ title: "Settings", url: "/settings", icon: Settings }],
      grouped: null,
    },
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatar: "",
    },
    userMenuItems: [
      {
        type: "link",
        name: "Settings",
        href: "/account/settings",
      },
      { type: "action", name: "Sign out", onClick: fn() },
    ] satisfies AppSidebarProps["userMenuItems"],
    isMobile: false,
    logo: {},
    versionState: {
      deployment: "cloud",
    } satisfies VersionState,
    showDemoBadge: false,
    v4UpgradeUiEnabled: true,
    notificationState: {
      dismissedIds: [],
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
    organization: null,
    project: null,
    organizations: null,
    canCreateOrganizations: false,
    canCreateProjects: false,
  },
});

const SidebarStory = ({
  open,
  args,
  showPageChrome = false,
}: {
  open: boolean;
  args: AppSidebarProps;
  showPageChrome?: boolean;
}) => (
  <SidebarProvider open={open}>
    <AppSidebar {...args} />
    <SidebarInset>
      {showPageChrome ? (
        <>
          <div
            data-testid={APP_SHELL_CHROME_ROW_TEST_ID}
            className={cn(APP_SHELL_CHROME_ROW_CLASS, "gap-3 px-3")}
          >
            <span className="text-muted-foreground text-sm">Toggle</span>
            <span className="bg-light-red text-dark-red rounded-md px-1 text-xs">
              PROD-EU
            </span>
          </div>
          <div className="text-primary px-3 py-1 text-lg leading-7 font-bold">
            Tracing
          </div>
        </>
      ) : (
        <div className="bg-muted/30 h-full" />
      )}
    </SidebarInset>
  </SidebarProvider>
);

export const Default = meta.story({});

export const CurrentOpenSource = meta.story({
  args: {
    versionState: {
      deployment: "self-hosted",
      plan: "oss",
      release: { status: "current" },
      migration: { status: "idle" },
    },
  },
});

export const CurrentGov = meta.story({
  args: {
    versionState: {
      deployment: "self-hosted",
      plan: "self-hosted:gov",
      release: { status: "current" },
      migration: { status: "idle" },
    },
  },
});

export const UpdateAvailable = meta.story({
  args: {
    versionState: {
      deployment: "self-hosted",
      plan: "self-hosted:pro",
      release: {
        status: "update-available",
        updateType: "minor",
        latestRelease: "3.128.0",
      },
      migration: { status: "idle" },
    },
  },
});

export const WidestVersionLabel = meta.story({
  name: "Widest version label (long version, OSS, update)",
  args: {
    version: "v4.128.12",
    versionState: {
      deployment: "self-hosted",
      plan: "oss",
      release: {
        status: "update-available",
        updateType: "major",
        latestRelease: "5.0.0",
      },
      migration: { status: "idle" },
    },
  },
});

export const MigrationInProgress = meta.story({
  args: {
    versionState: {
      deployment: "self-hosted",
      plan: "self-hosted:enterprise",
      release: { status: "current" },
      migration: { status: "in-progress", phase: "running" },
    },
  },
});

export const UpdateDuringMigration = meta.story({
  args: {
    versionState: {
      deployment: "self-hosted",
      plan: "self-hosted:enterprise",
      release: {
        status: "update-available",
        updateType: "major",
        latestRelease: "4.0.0",
      },
      migration: { status: "in-progress", phase: "pending" },
    },
  },
});

export const LaunchWeekStack = meta.story({
  beforeEach: () => setCurrentTimestamp(duringLaunchWeek),
  args: {
    v4UpgradeUiEnabled: false,
    notificationState: {
      dismissedIds: [],
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
});

export const LatestLaunchWeek = meta.story({
  beforeEach: () => setCurrentTimestamp(duringLaunchWeek),
  args: {
    v4UpgradeUiEnabled: false,
    notificationState: {
      dismissedIds: launchWeekNotificationIds.slice(0, 4),
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
});

export const GitHubStar = meta.story({
  name: "(Test) GitHub star",
  args: {
    v4UpgradeUiEnabled: false,
    notificationState: {
      dismissedIds: launchWeekNotificationIds,
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByAltText("Langfuse GitHub stars")).toHaveAttribute(
      "src",
      "https://img.shields.io/github/stars/langfuse/langfuse?label=langfuse&style=social",
    );
  },
});

export const AllNotificationsDismissed = meta.story({
  args: {
    v4UpgradeUiEnabled: false,
    notificationState: {
      dismissedIds: [...launchWeekNotificationIds, "github-star"],
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
});

export const MobileNavigation = meta.story({
  args: {
    isMobile: true,
    organization: { id: "org-acme", name: "Acme Inc." },
    project: { id: "project-analytics", name: "Analytics" },
    organizations: [
      {
        id: "org-acme",
        name: "Acme Inc.",
        role: "OWNER",
        cloudConfig: undefined,
        plan: "cloud:hobby",
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [
          {
            id: "project-analytics",
            name: "Analytics",
            role: "ADMIN",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
    canCreateOrganizations: true,
    canCreateProjects: true,
  },
});

// Enterprise co-branding: a configured logo replaces the Langfuse mark.
const sampleLogo = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="${fill}"/><text x="24" y="32" text-anchor="middle" font-family="Arial" font-weight="700" font-size="24" fill="white">A</text></svg>`,
  )}`;

export const CustomLogo = meta.story({
  args: {
    logo: {
      lightModeHref: sampleLogo("#1d4ed8"),
      darkModeHref: sampleLogo("#93c5fd"),
    },
    versionState: {
      deployment: "self-hosted",
      plan: "self-hosted:enterprise",
      release: { status: "current" },
      migration: { status: "idle" },
    },
    organization: { id: "org-acme", name: "Acme Inc." },
    organizations: [
      {
        id: "org-acme",
        name: "Acme Inc.",
        role: "OWNER",
        cloudConfig: undefined,
        plan: "self-hosted:enterprise",
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [],
      },
    ],
    canCreateOrganizations: true,
  },
});

export const CustomLogoCollapsed = meta.story({
  args: CustomLogo.input.args,
  render: (args) => <SidebarStory open={false} args={args} />,
});

const cloudEnterpriseOrg = (name: string): Partial<AppSidebarProps> => ({
  organization: { id: "org-enterprise", name },
  organizations: [
    {
      id: "org-enterprise",
      name,
      role: "OWNER",
      cloudConfig: undefined,
      plan: "cloud:enterprise",
      metadata: {},
      aiFeaturesEnabled: false,
      aiTelemetryEnabled: false,
      projects: [],
    },
  ],
});

export const EnterprisePlanBadge = meta.story({
  name: "(Test) Enterprise badge shows in full when the name fits",
  args: cloudEnterpriseOrg("Acme"),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("ENTERPRISE")).toBeVisible();
  },
});

export const EnterprisePlanBadgeLongName = meta.story({
  name: "(Test) Enterprise badge shortens to ENT for a long name",
  args: cloudEnterpriseOrg("Acme Research Labs"),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("ENT")).toBeVisible();
    await expect(canvas.queryByText("ENTERPRISE")).toBeNull();
  },
});

export const Collapsed = meta.story({
  render: (args) => <SidebarStory open={false} args={args} />,
});

export const WithPageChrome = meta.story({
  args: {
    showDemoBadge: true,
  },
  render: (args) => <SidebarStory open args={args} showPageChrome />,
});

export const ChromeRowAlignment = meta.story({
  name: "(Test) Chrome Row Aligns With Page Header",
  args: {
    showDemoBadge: true,
  },
  render: (args) => <SidebarStory open args={args} showPageChrome />,
  play: async ({ canvas }) => {
    const rows = canvas.getAllByTestId(APP_SHELL_CHROME_ROW_TEST_ID);
    await expect(rows).toHaveLength(2);

    const [sidebarRow, pageRow] = rows;
    const sidebarBox = sidebarRow.getBoundingClientRect();
    const pageBox = pageRow.getBoundingClientRect();

    // Skip geometry when the desktop sidebar is `display: none` (narrow
    // Storybook viewport uses the mobile sheet instead).
    if (sidebarBox.width === 0) return;

    // Same box geometry (the shared min-h-11 + border-b class). Absolute Y
    // also matches when this file uses `layout: fullscreen` so the fixed
    // sidebar and the in-flow inset share an origin.
    await expect(Math.abs(sidebarBox.height - pageBox.height)).toBeLessThan(1);
    await expect(Math.abs(sidebarBox.bottom - pageBox.bottom)).toBeLessThan(1);
  },
});

const SETUP_REQUIRED_REASON = "Finish the gateway setup on Overview first.";

const aiGatewayNavigationArgs = {
  navItems: {
    ungrouped: [
      { title: "Go to...", url: "", icon: Search },
      { title: "Projects", url: "/organization/org-acme", icon: Grid2X2 },
    ],
    grouped: {
      "AI Gateway": [
        {
          title: "Overview",
          url: "/organization/org-acme/ai-gateway",
          icon: Home,
          isActive: true,
        },
        {
          title: "Connections & Models",
          url: "/organization/org-acme/ai-gateway/models",
          icon: Box,
          disabledReason: SETUP_REQUIRED_REASON,
        },
        {
          title: "Gateway keys",
          url: "/organization/org-acme/ai-gateway/api-keys",
          icon: KeyRound,
          disabledReason: SETUP_REQUIRED_REASON,
        },
      ],
    },
  },
} satisfies Partial<AppSidebarProps>;

export const AiGatewayNavigation = meta.story({
  args: aiGatewayNavigationArgs,
});

export const AiGatewayNavigationDisabledReason = meta.story({
  name: "(Test) Disabled gateway entries show their reason on focus",
  args: aiGatewayNavigationArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const models = canvas.getByRole("link", { name: "Connections & Models" });
    await expect(models).toHaveAttribute("aria-disabled", "true");

    models.focus();
    const reason = await body.findByText(SETUP_REQUIRED_REASON);
    await waitFor(() => expect(reason).toBeVisible());
  },
});

/** Once set up, managers also get a link to the traces of the project that receives gateway traffic. */
export const AiGatewayNavigationSetUp = meta.story({
  args: {
    navItems: {
      ungrouped: [
        { title: "Go to...", url: "", icon: Search },
        { title: "Projects", url: "/organization/org-acme", icon: Grid2X2 },
      ],
      grouped: {
        "AI Gateway": [
          {
            title: "Overview",
            url: "/organization/org-acme/ai-gateway",
            icon: Home,
            isActive: true,
          },
          {
            title: "Connections & Models",
            url: "/organization/org-acme/ai-gateway/models",
            icon: Box,
          },
          {
            title: "Gateway keys",
            url: "/organization/org-acme/ai-gateway/api-keys",
            icon: KeyRound,
          },
          {
            title: "Tracing",
            url: "/project/project-gateway/traces",
            icon: ListTree,
            label: <ArrowUpRight size="base" color="tertiary" aria-hidden />,
          },
        ],
      },
    },
  },
});
