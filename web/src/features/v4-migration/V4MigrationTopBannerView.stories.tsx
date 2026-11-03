import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { V4MigrationTopBannerView } from "./V4MigrationTopBannerView";

const WARNING_MESSAGE =
  "Action required: After November 16, 2026, some features may stop working for at least one of your projects.";
const CRITICAL_MESSAGE =
  "Action required: Some features may not be working for at least one of your projects.";

const meta = preview.meta({
  component: V4MigrationTopBannerView,
  args: {
    severity: "warning" as const,
    message: WARNING_MESSAGE,
    onStatusClick: fn(),
  },
});

/** Orange strip. The message is the warning env value. */
export const Warning = meta.story({});

/** Red strip. The message is the critical env value. */
export const Critical = meta.story({
  args: {
    severity: "critical" as const,
    message: CRITICAL_MESSAGE,
  },
});
