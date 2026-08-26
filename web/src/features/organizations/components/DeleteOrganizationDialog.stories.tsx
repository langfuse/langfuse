import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";

import preview from "../../../../.storybook/preview";

import { DeleteOrganizationDialog } from "./DeleteOrganizationDialog";

const defaultArgs = {
  open: true,
  onOpenChange: fn(),
  confirmMessage: "acme",
  hasProjects: false,
  isPending: false,
  onConfirm: fn(),
} satisfies ComponentProps<typeof DeleteOrganizationDialog>;

const meta = preview.meta({
  component: DeleteOrganizationDialog,
});

export default meta;

export const Default = meta.story({
  args: defaultArgs,
});

export const WithProjects = meta.story({
  args: {
    ...defaultArgs,
    hasProjects: true,
  },
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    isPending: true,
  },
});

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: defaultArgs,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(body.getByPlaceholderText("acme"), "acme");
    await userEvent.click(
      body.getByRole("button", { name: "Delete Organization" }),
    );

    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
});
