import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";

import preview from "../../../../.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";

import { DeleteOrganizationDialogContent } from "./DeleteOrganizationDialogContent";

const defaultArgs = {
  confirmMessage: "acme",
  hasProjects: false,
  isPending: false,
  onConfirm: fn(),
} satisfies ComponentProps<typeof DeleteOrganizationDialogContent>;

const renderDialog = (
  args: ComponentProps<typeof DeleteOrganizationDialogContent>,
) => (
  <Dialog open onOpenChange={fn()}>
    <DialogContent className="sm:max-w-[425px]">
      <DeleteOrganizationDialogContent {...args} />
    </DialogContent>
  </Dialog>
);

const meta = preview.meta({
  component: DeleteOrganizationDialogContent,
});

export default meta;

export const Default = meta.story({
  args: defaultArgs,
  render: renderDialog,
});

export const WithProjects = meta.story({
  args: {
    ...defaultArgs,
    hasProjects: true,
  },
  render: renderDialog,
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    isPending: true,
  },
  render: renderDialog,
});

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: defaultArgs,
  render: renderDialog,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(body.getByPlaceholderText("acme"), "acme");
    await userEvent.click(
      body.getByRole("button", { name: "Delete Organization" }),
    );

    await expect(args.onConfirm).toHaveBeenCalledOnce();
  },
});
