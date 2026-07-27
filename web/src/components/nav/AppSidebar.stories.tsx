import type { ComponentProps } from "react";
import { Activity, BookOpen, Home, Settings } from "lucide-react";
import { expect, fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

type AppSidebarProps = ComponentProps<typeof AppSidebar>;
type VersionState = AppSidebarProps["versionState"];
type NotificationState = AppSidebarProps["notificationState"];

const launchWeekNotificationIds = ["lw5-1", "lw5-2", "lw5-3", "lw5-4", "lw5-5"];
const duringLaunchWeek = new Date("2026-05-29T12:00:00Z").getTime();
const afterLaunchWeek = new Date("2026-07-27T12:00:00Z").getTime();

const meta = preview.meta({
  component: AppSidebar,
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
      { name: "Account Settings", href: "/account/settings" },
      { name: "Sign out", onClick: fn() },
    ],
    isMobile: false,
    versionState: {
      deployment: "cloud",
    } satisfies VersionState,
    showDemoBadge: false,
    notificationState: {
      status: "hidden",
    } satisfies NotificationState,
  },
});

const SidebarStory = ({
  open,
  args,
}: {
  open: boolean;
  args: AppSidebarProps;
}) => (
  <SidebarProvider open={open}>
    <AppSidebar {...args} />
    <SidebarInset>
      <div className="bg-muted/30 h-full" />
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
  args: {
    notificationState: {
      status: "visible",
      currentTimestamp: duringLaunchWeek,
      dismissedIds: [],
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
});

export const LatestLaunchWeek = meta.story({
  args: {
    notificationState: {
      status: "visible",
      currentTimestamp: duringLaunchWeek,
      dismissedIds: launchWeekNotificationIds.slice(0, 4),
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
});

export const GitHubStar = meta.story({
  args: {
    notificationState: {
      status: "visible",
      currentTimestamp: afterLaunchWeek,
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
    notificationState: {
      status: "visible",
      currentTimestamp: duringLaunchWeek,
      dismissedIds: [...launchWeekNotificationIds, "github-star"],
      onDismiss: fn(),
      onLinkClick: fn(),
    } satisfies NotificationState,
  },
});

export const Collapsed = meta.story({
  render: (args) => <SidebarStory open={false} args={args} />,
});
