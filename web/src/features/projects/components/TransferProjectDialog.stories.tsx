import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";

import { TransferProjectDialog } from "./TransferProjectDialog";

const defaultArgs = {
  open: true,
  onOpenChange: fn(),
  projectName: "Support assistant",
  organizationName: "Acme",
  organizations: [{ id: "organization-2", name: "Example" }],
  isPending: false,
  onConfirm: fn(),
} satisfies ComponentProps<typeof TransferProjectDialog>;

const meta = preview.meta({
  component: TransferProjectDialog,
});

export default meta;

export const Default = meta.story({
  args: defaultArgs,
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    isPending: true,
  },
});

export const ConfirmsTransfer = meta.story({
  name: "(Test) Confirms transfer",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Confirm" }),
      "acme/support-assistant",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Transfer project" }),
    );

    await expect(args.onConfirm).toHaveBeenCalledWith("organization-2");
  },
});
