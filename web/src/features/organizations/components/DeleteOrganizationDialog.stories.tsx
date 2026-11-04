import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

import {
  DeleteOrganizationDialog,
  type DeleteOrganizationDialogProps,
} from "./DeleteOrganizationDialog";

const defaultArgs = {
  confirmMessage: "acme",
  hasProjects: false,
  isPending: false,
  onConfirm: fn(),
} satisfies DeleteOrganizationDialogProps;

const renderDialog = (args: DeleteOrganizationDialogProps) => (
  <DialogController
    initialState={() => true}
    renderDialog={() => <DeleteOrganizationDialog {...args} />}
  >
    {() => null}
  </DialogController>
);

const meta = preview.meta({
  component: DeleteOrganizationDialog,
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
