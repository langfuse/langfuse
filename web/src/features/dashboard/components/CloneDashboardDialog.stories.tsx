import { withOpenOverlay } from "@/.storybook/decorators/withOpenOverlay";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { CloneDashboardDialog } from "./CloneDashboardDialog";

const meta = preview.meta({
  component: CloneDashboardDialog,
  parameters: { layout: "fullscreen" },
  decorators: [withOpenOverlay],
  args: {
    dashboardName: "Overview",
    setAsHome: false,
    hasPendingChange: false,
    isPending: false,
    onConfirm: fn(),
    onOpenExisting: fn(),
  },
});

export default meta;

export const Default = meta.story({});

export const WithPendingChange = meta.story({
  args: { hasPendingChange: true },
});

export const SetAsHome = meta.story({
  args: { setAsHome: true },
});

export const ExistingCopy = meta.story({
  args: { existingCloneName: "Overview (Clone)" },
});

export const ExistingCopyWithPendingChange = meta.story({
  args: {
    existingCloneName: "Overview (Clone)",
    hasPendingChange: true,
  },
});

export const CreatingCopy = meta.story({
  args: { isPending: true, existingCloneName: "Overview (Clone)" },
});
