import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SlackDisconnectDialog } from "./SlackDisconnectDialog";

const meta = preview.meta({
  component: SlackDisconnectDialog,
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
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
