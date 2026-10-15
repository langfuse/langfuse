import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

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

export const ScrollableBody = meta.story({
  name: "(Test) Long content scrolls above the footer",
  render: () => (
    <DialogController
      initialState={() => true}
      renderDialog={() => (
        <Dialog
          title="Scrollable dialog"
          actions={[{ label: "Continue", onClick: fn() }]}
        >
          <Dialog.Body>
            {Array.from({ length: 40 }, (_, index) => (
              <p key={index}>Dialog content row {index + 1}</p>
            ))}
            <p>End of dialog content</p>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {() => null}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog", { name: "Scrollable dialog" });
    const end = within(dialog).getByText("End of dialog content");
    const scroller = end.parentElement!;
    const footer = dialog.querySelector("footer")!;
    function expectSeparateBodyAndFooter() {
      const bounds = dialog.getBoundingClientRect();
      const actions = footer.getBoundingClientRect();
      expect(actions.top).toBeGreaterThanOrEqual(
        scroller.getBoundingClientRect().bottom - 1,
      );
      expect(actions.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
      expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    }
    await waitFor(expectSeparateBodyAndFooter);
    scroller.scrollTop = scroller.scrollHeight;
    await waitFor(() => {
      expectSeparateBodyAndFooter();
      expect(scroller.scrollTop).toBeGreaterThan(0);
      expect(end.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        footer.getBoundingClientRect().top + 1,
      );
    });
  },
});
