import preview from "../../../.storybook/preview";
import { V4MigrationHeaderContent } from "./V4MigrationContent";

// The panel takes ~40% of a desktop viewport; this width keeps the line breaks
// representative of what users actually read.
const PANEL_WIDTH = "w-[520px]";

const meta = preview.meta({
  component: V4MigrationHeaderContent,
  decorators: [
    (Story) => (
      <div className={PANEL_WIDTH}>
        <Story />
      </div>
    ),
  ],
});

// What a project with remaining upgrade steps sees, opened from the sidebar.
export const ActionNeeded = meta.story({
  args: { readiness: "action-needed" },
});

export const Ready = meta.story({
  args: { readiness: "ready" },
});

export const Checking = meta.story({
  args: { readiness: "checking" },
});
