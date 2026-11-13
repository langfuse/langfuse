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

/** Calm amber strip matching the existing customer-data warning treatment. */
export const Warning = meta.story({});

/** Red strip reserved for critical migration warnings. */
export const Critical = meta.story({
  args: {
    severity: "critical" as const,
    message: CRITICAL_MESSAGE,
  },
});
