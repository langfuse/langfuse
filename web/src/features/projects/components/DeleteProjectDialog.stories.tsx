import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

const meta = preview.meta({
  component: DeleteProjectDialog,
});

export default meta;

const trigger = <Button>Open deletion dialog</Button>;

export const Default = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    trigger,
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
});

export const Loading = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    trigger,
    confirmMessage: "acme/my-project",
    isPending: true,
    onSubmit: fn(),
  },
});

export const GatewayIngestionProject = meta.story({
  name: "Gateway ingestion project",
  args: {
    open: true,
    onOpenChange: fn(),
    trigger,
    blocked: true,
    onOpenGatewaySettings: fn(),
  },
});

export const ConfirmsDeletion = meta.story({
  name: "(Test) Confirms deletion",
  args: {
    open: true,
    onOpenChange: fn(),
    trigger,
    confirmMessage: "acme/my-project",
    isPending: false,
    onSubmit: fn(),
  },
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
