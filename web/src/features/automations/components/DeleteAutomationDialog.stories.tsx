import { withOpenOverlay } from "@/.storybook/decorators/withOpenOverlay";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog";

const meta = preview.meta({
  component: DeleteAutomationDialog,
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

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: {
    isPending: false,
    onConfirm: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const deleteButton = body.getByRole("button", {
      name: "Delete Automation",
    });

    await userEvent.click(deleteButton);

    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
});
