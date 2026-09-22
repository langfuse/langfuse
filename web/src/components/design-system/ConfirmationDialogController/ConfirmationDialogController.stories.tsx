import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";

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
      <Button onClick={openDialog} text="Archive score config" />
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
      <Button onClick={openDialog} text="Delete project" />
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
      <Button onClick={openDialog} text="Archive score config" />
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
      <Button onClick={openDialog} text="Delete project" />
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
