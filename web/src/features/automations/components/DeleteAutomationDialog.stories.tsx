import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog";

const meta = preview.meta({
  component: DeleteAutomationDialog,
});

export default meta;

export const Default = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    isPending: false,
    onConfirm: fn(),
  },
});

export const Loading = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    isPending: true,
    onConfirm: fn(),
  },
});

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: {
    open: true,
    onOpenChange: fn(),
    isPending: false,
    onConfirm: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      body.getByRole("button", { name: "Delete Automation" }),
    );

    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
});
