import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";

import { ConfirmationDialogController } from "./ConfirmationDialogController";

const meta = preview.meta({
  component: ConfirmationDialogController,
  parameters: { layout: "centered" },
});

const onConfirm = fn();

export const StandardExample = meta.story({
  name: "Standard",
  args: {
    title: "Archive score config",
    text: "This score config will no longer be available for new scores.",
    confirmLabel: "Archive",
    variant: "destructive",
    onConfirm,
    children: ({ openDialog }) => (
      <Button onClick={openDialog}>Archive score config</Button>
    ),
  },
});

export const TypeToConfirmExample = meta.story({
  name: "Type to confirm",
  args: {
    title: "Delete project",
    text: "This action cannot be undone.",
    confirmationText: "my-project",
    confirmLabel: "Delete project",
    variant: "destructive",
    onConfirm,
    children: ({ openDialog }) => (
      <Button onClick={openDialog}>Delete project</Button>
    ),
  },
});

export const Standard = meta.story({
  name: "(Test) Standard",
  args: {
    title: "Archive score config",
    text: "This score config will no longer be available for new scores.",
    confirmLabel: "Archive",
    variant: "destructive",
    onConfirm,
    children: ({ openDialog }) => (
      <Button onClick={openDialog}>Archive score config</Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    onConfirm.mockClear();

    await userEvent.click(
      canvas.getByRole("button", { name: "Archive score config" }),
    );
    await userEvent.click(body.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});

export const TypeToConfirm = meta.story({
  name: "(Test) Type to confirm",
  args: {
    title: "Delete project",
    text: "This action cannot be undone.",
    confirmationText: "my-project",
    confirmLabel: "Delete project",
    variant: "destructive",
    onConfirm,
    children: ({ openDialog }) => (
      <Button onClick={openDialog}>Delete project</Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete project" }),
    );

    const confirmButton = body.getByRole("button", { name: "Delete project" });
    expect(confirmButton).toBeDisabled();
    await userEvent.type(body.getByRole("textbox"), "my-project");
    expect(confirmButton).toBeEnabled();
  },
});

export const CloseOnInteractionOutside = meta.story({
  name: "(Test) Close on interaction outside",
  args: {
    title: "Archive score config",
    text: "This score config will no longer be available for new scores.",
    confirmLabel: "Archive",
    variant: "destructive",
    closeOnInteractionOutside: true,
    onConfirm,
    children: ({ openDialog }) => (
      <Button onClick={openDialog}>Archive score config</Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bodyElement = canvasElement.ownerDocument.body;
    const body = within(bodyElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Archive score config" }),
    );
    expect(body.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(bodyElement);
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});
