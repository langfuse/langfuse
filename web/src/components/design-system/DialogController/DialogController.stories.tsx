import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

import { DialogController } from "./DialogController";

const meta = preview.meta({
  component: DialogController,
  parameters: {
    layout: "fullscreen",
  },
});

export const StateValues = meta.story({
  name: "(Test) State values",
  render: () => (
    <DialogController<string | null | undefined>
      renderDialog={({ state, closeDialog }) => (
        <Dialog title="Stateful dialog">
          <Dialog.Body>
            <output data-testid="dialog-state">{String(state)}</output>
            <button type="button" onClick={closeDialog}>
              Close from content
            </button>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ isOpen, openDialog }) => (
        <>
          <output data-testid="open-state">{isOpen ? "open" : "closed"}</output>
          <button type="button" onClick={() => openDialog(null)}>
            Open with null
          </button>
          <button type="button" onClick={() => openDialog(undefined)}>
            Open with undefined
          </button>
        </>
      )}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Open with null" }),
    );
    await waitFor(() => {
      expect(body.getByTestId("dialog-state")).toHaveTextContent("null");
      expect(canvas.getByTestId("open-state")).toHaveTextContent("open");
    });

    await userEvent.click(
      body.getByRole("button", { name: "Close from content" }),
    );
    await waitFor(() => {
      expect(canvas.getByTestId("open-state")).toHaveTextContent("closed");
      expect(body.queryByText("Stateful dialog")).not.toBeInTheDocument();
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Open with undefined" }),
    );
    await waitFor(() =>
      expect(body.getByTestId("dialog-state")).toHaveTextContent("undefined"),
    );
  },
});

const onBeforeClose = fn(() => false);
const onDismiss = fn();

export const CloseVeto = meta.story({
  name: "(Test) Close veto",
  render: () => (
    <DialogController
      onBeforeClose={onBeforeClose}
      onDismiss={onDismiss}
      renderDialog={() => <Dialog title="Vetoed dialog" text="Content" />}
    >
      {({ openDialog }) => (
        <button type="button" onClick={() => openDialog()}>
          Open
        </button>
      )}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    onBeforeClose.mockClear();
    onDismiss.mockClear();
    await userEvent.click(canvas.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(body.getByText("Vetoed dialog")).toBeVisible());
    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(onBeforeClose).toHaveBeenCalledOnce();
      expect(onDismiss).not.toHaveBeenCalled();
      expect(body.getByText("Vetoed dialog")).toBeVisible();
    });
  },
});

export const InitialState = meta.story({
  name: "(Test) Initial state",
  render: () => (
    <DialogController<string>
      initialState={() => "Initial state"}
      renderDialog={({ state }) => <Dialog title={state} text="Content" />}
    >
      {() => null}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await waitFor(() => expect(body.getByText("Initial state")).toBeVisible());
  },
});
