import preview from "../../../../.storybook/preview";
import { type SidebarVersionState, VersionLabel } from "./VersionLabel";

const meta = preview.meta({
  component: VersionLabel,
  args: {
    version: "v4.75.0",
    state: { deployment: "cloud" } as SidebarVersionState,
  },
});

export const Cloud = meta.story({});

export const SelfHostedCurrent = meta.story({
  args: {
    state: {
      deployment: "self-hosted",
      plan: "oss",
      release: { status: "current" },
      migration: { status: "idle" },
    },
  },
});

export const SelfHostedUpdateAvailable = meta.story({
  args: {
    state: {
      deployment: "self-hosted",
      plan: "self-hosted:pro",
      release: {
        status: "update-available",
        updateType: "minor",
        latestRelease: "4.76.0",
      },
      migration: { status: "idle" },
    },
  },
});

export const MigrationInProgress = meta.story({
  args: {
    state: {
      deployment: "self-hosted",
      plan: "self-hosted:enterprise",
      release: { status: "current" },
      migration: { status: "in-progress", phase: "running" },
    },
  },
});
