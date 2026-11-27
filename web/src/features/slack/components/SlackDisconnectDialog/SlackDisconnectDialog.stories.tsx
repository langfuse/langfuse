import { OpenOverlay } from "@/src/components/design-system/OpenOverlay/OpenOverlay";
import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { SlackDisconnectDialog } from "./SlackDisconnectDialog";

const meta = preview.meta({
  component: SlackDisconnectDialog,
  decorators: [
    (Story) => (
      <OpenOverlay>
        <Story />
      </OpenOverlay>
    ),
  ],
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
