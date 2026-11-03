import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { renderV4BannerMessage } from "./topBannerContent";
import { V4MigrationTopBannerView } from "./V4MigrationTopBannerView";

const WARNING_MESSAGE =
  "Legacy v3 is still in use in {projects}. Trace-level evals and exports stop on November 16. SDKs and APIs stop on November 19.";
const CRITICAL_MESSAGE = "Legacy v3 is paused today, 16:00 to 17:00 CET.";

const messageFor = (template: string) => renderV4BannerMessage(template, 3);

const meta = preview.meta({
  component: V4MigrationTopBannerView,
  args: {
    severity: "warning" as const,
    message: messageFor(WARNING_MESSAGE),
    showUpdate: true,
    onUpdateClick: fn(),
  },
});

/** Orange strip. The message is the warning env value. */
export const Warning = meta.story({});

/** Members cannot fix integrations, so they get the admin hint instead. */
export const WarningMember = meta.story({
  args: { showUpdate: false },
});

/** Red strip. The message is the critical env value. */
export const Critical = meta.story({
  args: {
    severity: "critical" as const,
    message: messageFor(CRITICAL_MESSAGE),
  },
});

export const CriticalMember = meta.story({
  args: {
    severity: "critical" as const,
    message: messageFor(CRITICAL_MESSAGE),
    showUpdate: false,
  },
});
