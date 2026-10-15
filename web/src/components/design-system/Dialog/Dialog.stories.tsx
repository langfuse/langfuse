import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { PopoverController } from "@/src/components/ui/popover";
import { ModalPopoverLayer } from "@/src/context/LayerContext/ModalPopoverLayer";

import { Dialog } from "./Dialog";

type Size = NonNullable<React.ComponentProps<typeof Dialog>["size"]>;

const allSizes = Object.keys({
  sm: true,
  default: true,
  lg: true,
  xxl: true,
} satisfies Record<Size, true>) as Size[];

const meta = preview.meta({
  component: Dialog,
  parameters: {
    layout: "fullscreen",
  },
});

export default meta;

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="grid max-w-sm gap-3 p-6">
      {allSizes.map((size) => (
        <DialogController
          key={size}
          renderDialog={() => (
            <Dialog
              size={size}
              title={`${size} dialog`}
              text="Dialog body content remains readable at every supported size."
              actions={[{ label: "Continue", onClick: fn() }]}
            />
          )}
        >
          {({ openDialog }) => (
            <button
              className="rounded-md border px-3 py-2 text-left text-sm"
              type="button"
              onClick={() => openDialog()}
            >
              Open {size}
            </button>
          )}
        </DialogController>
      ))}
    </div>
  ),
});

export const Autofocus = meta.story({
  name: "(Test) Autofocus",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Text-only dialog"
          text="The primary action receives focus when this dialog opens."
          actions={[
            { label: "Go back", onClick: fn() },
            { label: "Continue", onClick: fn() },
          ]}
        />
      )}
    >
      {({ openDialog }) => (
        <button type="button" onClick={() => openDialog()}>
          Open dialog
        </button>
      )}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Continue" })).toHaveFocus(),
    );
  },
});

export const DestructiveAutofocus = meta.story({
  name: "(Test) Destructive autofocus",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Delete item"
          text="This action cannot be undone."
          actions={[
            { label: "Keep item", onClick: fn() },
            {
              label: "Delete",
              onClick: fn(),
              variant: "destructive",
            },
          ]}
        />
      )}
    >
      {({ openDialog }) => (
        <button type="button" onClick={() => openDialog()}>
          Open dialog
        </button>
      )}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Keep item" })).toHaveFocus(),
    );
  },
});

export const DestructiveOnlyAutofocus = meta.story({
  name: "(Test) Destructive-only autofocus",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Delete item"
          text="This action cannot be undone."
          actions={[
            {
              label: "Delete",
              onClick: fn(),
              variant: "destructive",
            },
          ]}
        />
      )}
    >
      {({ openDialog }) => (
        <button type="button" onClick={() => openDialog()}>
          Open dialog
        </button>
      )}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await waitFor(() =>
      expect(body.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  },
});

export const PopoverKeyboardInteraction = meta.story({
  name: "(Test) Popover controls remain accessible inside a modal",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Filter traces"
          actions={[{ label: "Apply", onClick: fn() }]}
        >
          <ModalPopoverLayer>
            <Dialog.Body>
              <p>
                Open the filter, enter a user ID, then press Escape to return to
                the dialog.
              </p>
              <PopoverController
                align="start"
                contentClassName="w-72"
                disabled={false}
                modal={false}
                renderContent={({ closePopover }) => (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      User ID
                      <Input aria-label="User ID" />
                    </label>
                    <Button text="Done" onClick={closePopover} />
                  </div>
                )}
              >
                {({ Trigger }) => (
                  <Trigger asChild>
                    <button
                      className="rounded-md border px-3 py-2 text-sm"
                      type="button"
                    >
                      Edit filter
                    </button>
                  </Trigger>
                )}
              </PopoverController>
            </Dialog.Body>
          </ModalPopoverLayer>
        </Dialog>
      )}
    >
      {({ openDialog }) => {
        function handleOpen() {
          openDialog();
        }
        return <Button text="Open dialog" onClick={handleOpen} />;
      }}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Open dialog" }),
    );
    const dialog = body.getByRole("dialog", { name: "Filter traces" });
    const trigger = within(dialog).getByRole("button", { name: "Edit filter" });
    await userEvent.click(trigger);
    const input = await body.findByRole("textbox", { name: "User ID" });
    await userEvent.type(input, "user-example");
    await expect(input).toHaveValue("user-example");
    await expect(input).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await expect(
      await body.findByRole("textbox", { name: "User ID" }),
    ).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  },
});
