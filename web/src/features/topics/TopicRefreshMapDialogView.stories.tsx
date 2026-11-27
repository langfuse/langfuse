import { withOpenOverlay } from "@/.storybook/decorators/withOpenOverlay";
import { fn } from "storybook/test";

import preview from "../../../.storybook/preview";
import { TopicRefreshMapDialogView } from "./TopicRefreshMapDialogView";

const now = Date.parse("2026-11-18T12:00:00.000Z");

const meta = preview.meta({
  component: TopicRefreshMapDialogView,
  parameters: { layout: "fullscreen" },
  args: {
    rule: {
      name: "Halo only",
      enabled: true,
      lastRefitAt: new Date(now - 8 * 3_600_000).toISOString(),
    },
    now,
    refreshing: false,
    onRefresh: fn(),
  },
  decorators: [withOpenOverlay],
});

export const Default = meta.story({ name: "Refresh map" });

export const Refreshing = meta.story({ args: { refreshing: true } });
