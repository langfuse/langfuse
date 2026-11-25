import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import {
  V4_MIGRATION_DECEMBER_DEADLINE_MESSAGE,
  V4_MIGRATION_DELAYED_DEADLINE_MESSAGE,
  V4_MIGRATION_STATUS_LINK_LABEL,
  V4_MIGRATION_TOP_BANNER_MESSAGE,
} from "./v4MigrationBannerCopy";
import { V4MigrationTopBannerView } from "./V4MigrationTopBannerView";

const CRITICAL_MESSAGE =
  "Action required: Some features may not be working for at least one of your projects.";

const meta = preview.meta({
  component: V4MigrationTopBannerView,
  args: {
    severity: "warning" as const,
    message: V4_MIGRATION_TOP_BANNER_MESSAGE,
    onStatusClick: fn(),
  },
});

/** Calm amber strip matching the existing customer-data warning treatment. */
export const Warning = meta.story({});

/** Red strip reserved for critical migration warnings. */
export const Critical = meta.story({
  args: {
    severity: "critical" as const,
    message: CRITICAL_MESSAGE,
  },
});

/** Top customers whose cutoff moved to November 23. Same page as the deadline banner. */
export const DelayedDeadline = meta.story({
  args: {
    message: V4_MIGRATION_DELAYED_DEADLINE_MESSAGE,
    linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
  },
});

/** Organizations whose deadline is December 31. Same page as the other banners. */
export const DecemberDeadline = meta.story({
  args: {
    message: V4_MIGRATION_DECEMBER_DEADLINE_MESSAGE,
    linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
  },
});
