import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import {
  DeleteProjectDialog,
  type DeleteProjectDialogProps,
} from "./DeleteProjectDialog";

const meta = preview.meta({
  component: DeleteProjectDialog,
});

export default meta;

const renderDialog = (args: DeleteProjectDialogProps) => (
  <Dialog open onOpenChange={fn()}>
    <DialogContent className="sm:max-w-[425px]">
      <DeleteProjectDialog {...args} />
    </DialogContent>
  </Dialog>
);

export const Default = meta.story({
  args: {
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
  render: renderDialog,
});

export const Loading = meta.story({
  args: {
    confirmMessage: "acme/my-project",
    isPending: true,
    onSubmit: fn(),
  },
  render: renderDialog,
});

export const GatewayIngestionProject = meta.story({
  name: "Gateway ingestion project",
  args: {
    blocked: true,
    onOpenGatewaySettings: fn(),
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

    if (!("onSubmit" in args)) throw new Error("Expected deletion dialog");
    await expect(args.onSubmit).toHaveBeenCalledOnce();
  },
});
