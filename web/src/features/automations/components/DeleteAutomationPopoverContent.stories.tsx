import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DeleteAutomationPopoverContent } from "./DeleteAutomationPopoverContent";

const meta = preview.meta({
  component: DeleteAutomationPopoverContent,
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
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Automation" }),
    );

    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
});
