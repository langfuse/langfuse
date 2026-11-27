import { withOpenOverlay } from "@/.storybook/decorators/withOpenOverlay";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { SlackDisconnectDialog } from "./SlackDisconnectDialog";

const meta = preview.meta({
  component: SlackDisconnectDialog,
  decorators: [withOpenOverlay],
});

export default meta;

export const Default = meta.story({
  args: {
    isPending: false,
    onConfirm: fn(),
  },
});

export const Loading = meta.story({
  args: {
    isPending: true,
    onConfirm: fn(),
  },
});
