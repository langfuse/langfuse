import { expect, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";

import preview from "../../../../.storybook/preview";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

import { ControlledDialog } from "./ControlledDialog";

const meta = preview.meta({
  component: ControlledDialog,
  args: {
    open: false,
    onOpenChange: () => undefined,
    children: null,
  },
  parameters: {
    layout: "fullscreen",
  },
  render: function ControlledDialogExample() {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");

    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open from header
        </button>
        <button type="button" onClick={() => setOpen(true)}>
          Open from notice
        </button>
        <ControlledDialog open={open} onOpenChange={setOpen}>
          <Dialog title="Controlled dialog">
            <Dialog.Body>
              <input
                aria-label="Draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="button" onClick={() => setOpen(false)}>
                Close from content
              </button>
            </Dialog.Body>
          </Dialog>
        </ControlledDialog>
      </>
    );
  },
});

export const Default = meta.story({});

export const StatePersistsAcrossOpens = meta.story({
  name: "(Test) State persists across entry points",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Open from header" }),
    );
    await userEvent.type(body.getByRole("textbox", { name: "Draft" }), "kept");
    await userEvent.click(
      body.getByRole("button", { name: "Close from content" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Open from notice" }),
    );
    await expect(body.getByRole("textbox", { name: "Draft" })).toHaveValue(
      "kept",
    );

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});
