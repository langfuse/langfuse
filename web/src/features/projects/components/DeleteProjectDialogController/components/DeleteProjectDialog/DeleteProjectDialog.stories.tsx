import { OpenOverlay } from "@/src/components/design-system/OpenOverlay/OpenOverlay";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import {
  DeleteProjectDialog,
  type DeleteProjectDialogProps,
} from "./DeleteProjectDialog";

const meta = preview.meta({
  component: DeleteProjectDialog,
});

export default meta;

const renderDialog = (args: DeleteProjectDialogProps) => (
  <OpenOverlay>
    <DeleteProjectDialog {...args} />
  </OpenOverlay>
);

export const Default = meta.story({
  args: {
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
  render: renderDialog,
});

export const GatewayIngestionProject = meta.story({
  args: {
    confirmMessage: "acme/gateway-traces",
    isPending: false,
    onSubmit: fn(),
    gatewayOrganizationName: "Acme",
  },
  render: renderDialog,
});

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: {
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
  render: renderDialog,
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.type(
      body.getByPlaceholderText("acme/my-project"),
      "acme/my-project",
    );
    await userEvent.click(body.getByRole("button", { name: "Delete project" }));

    await expect(args.onSubmit).toHaveBeenCalledOnce();
  },
});
