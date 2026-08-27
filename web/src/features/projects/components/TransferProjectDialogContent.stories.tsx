import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Dialog } from "@/src/components/ui/dialog";

import { TransferProjectDialogContent } from "./TransferProjectDialogContent";

const defaultArgs = {
  projectName: "Support assistant",
  organizationName: "Acme",
  organizations: [{ id: "organization-2", name: "Example" }],
  isPending: false,
  onConfirm: fn(),
} satisfies ComponentProps<typeof TransferProjectDialogContent>;

const meta = preview.meta({
  component: TransferProjectDialogContent,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <Dialog open onOpenChange={fn()}>
        <Story />
      </Dialog>
    ),
  ],
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
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(body.getByRole("combobox"));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await userEvent.type(
      body.getByRole("textbox", { name: "Confirm" }),
      "acme/support-assistant",
    );
    await userEvent.click(
      body.getByRole("button", { name: "Transfer project" }),
    );

    await expect(args.onConfirm).toHaveBeenCalledWith("organization-2");
  },
});
