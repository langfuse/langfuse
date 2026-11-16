import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import {
  V4_BROWNOUT_LINK_LABEL,
  V4_BROWNOUT_MOBILE_LABEL,
  V4_BROWNOUT_STATUS_URL,
  V4_MIGRATION_BROWNOUT_MESSAGE,
  V4_MIGRATION_EXTENDED_DEADLINE_MESSAGE,
  V4_MIGRATION_STATUS_LINK_LABEL,
} from "./v4MigrationBannerCopy";
import { V4MigrationTopBannerView } from "./V4MigrationTopBannerView";

const WARNING_MESSAGE = V4_MIGRATION_EXTENDED_DEADLINE_MESSAGE;
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

/** Projects on today's freeze list. The link opens the public status page. */
export const Brownout = meta.story({
  args: {
    severity: "critical" as const,
    message: V4_MIGRATION_BROWNOUT_MESSAGE,
    href: V4_BROWNOUT_STATUS_URL,
    linkLabel: V4_BROWNOUT_LINK_LABEL,
    mobileLabel: V4_BROWNOUT_MOBILE_LABEL,
  },
});

/** Top customers whose cutoff moved to November 23. Same page as the deadline banner. */
export const ExtendedDeadline = meta.story({
  args: {
    message: V4_MIGRATION_EXTENDED_DEADLINE_MESSAGE,
    linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
  },
});
