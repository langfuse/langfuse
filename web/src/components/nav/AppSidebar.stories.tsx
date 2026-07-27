import type { ComponentProps } from "react";
import { Activity, BookOpen, Home, Settings } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

type AppSidebarProps = ComponentProps<typeof AppSidebar>;
type VersionState = AppSidebarProps["versionState"];

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

export const Collapsed = meta.story({
  render: (args) => <SidebarStory open={false} args={args} />,
});
