import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Button } from "@/src/components/design-system/Button/Button";

import { Dialog } from "./Dialog";

type Size = NonNullable<React.ComponentProps<typeof Dialog>["size"]>;

const allSizes = Object.keys({
  sm: true,
  default: true,
  md: true,
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

export const CloseOnly = meta.story({
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Import finished"
          text="All prompts were imported."
          closeLabel="Done"
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
});

export const DividedBody = meta.story({
  name: "(Test) Divided body",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog title="Divided dialog" closeLabel="Done">
          <Dialog.Body separators="both">
            {Array.from({ length: 30 }, (_, index) => (
              <p key={index}>Review instruction {index + 1}.</p>
            ))}
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => <Button text="Open dialog" onClick={openDialog} />}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    const scrollBody = body.getByText("Review instruction 1.").parentElement!;
    const footer = body.getByRole("button", { name: "Done" }).parentElement!;
    await expect(scrollBody).toHaveStyle({
      borderTopWidth: "1px",
      borderBottomWidth: "1px",
    });
    await expect(scrollBody.scrollHeight).toBeGreaterThan(
      scrollBody.clientHeight,
    );
    await expect(scrollBody.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      footer.getBoundingClientRect().top + 1,
    );
    body.getByText("Review instruction 30.").scrollIntoView();
    await waitFor(() => expect(scrollBody.scrollTop).toBeGreaterThan(0));
    await userEvent.click(body.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
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

export const DisabledActionWithReason = meta.story({
  name: "(Test) Disabled action with reason",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Add model"
          text="Hover the disabled action to see why it is unavailable."
          actions={[
            {
              label: "Add model",
              onClick: fn(),
              disabled: true,
              disabledReason: "This model is already listed.",
            },
          ]}
        />
      )}
    >
      {({ openDialog }) => <Button text="Open dialog" onClick={openDialog} />}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    const action = body.getByRole("button", { name: "Add model" });
    await expect(action).toBeDisabled();
    // Disabled buttons ignore pointer events, so the wrapper is the hover target.
    await userEvent.hover(action.parentElement!);
    // The open dialog marks the shared tooltip layer aria-hidden.
    const tooltip = await body.findByRole("tooltip", { hidden: true });
    await expect(tooltip).toHaveTextContent("This model is already listed.");
    const tooltipBounds = tooltip.getBoundingClientRect();
    await expect(
      tooltip.contains(
        document.elementFromPoint(
          tooltipBounds.left + tooltipBounds.width / 2,
          tooltipBounds.top + tooltipBounds.height / 2,
        ),
      ),
    ).toBe(true);
  },
});

export const ScrollableBodyKeepsControlsAboveFooter = meta.story({
  name: "(Test) Scrollable body keeps controls above footer",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Long dialog"
          actions={[{ label: "Save", onClick: fn() }]}
        >
          <Dialog.Body>
            {Array.from({ length: 20 }, (_, index) => (
              <p key={index}>Review instruction {index + 1}.</p>
            ))}
            <Button text="Additional action" onClick={fn()} />
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog }) => <Button text="Open dialog" onClick={openDialog} />}
    </DialogController>
  ),
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    const lowerControl = body.getByRole("button", {
      name: "Additional action",
    });
    const scrollBody = lowerControl.parentElement!;
    const footer = body.getByRole("button", { name: "Save" }).parentElement!;

    await expect(scrollBody.scrollHeight).toBeGreaterThan(
      scrollBody.clientHeight,
    );
    await expect(scrollBody.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      footer.getBoundingClientRect().top + 1,
    );

    lowerControl.scrollIntoView({ block: "center" });
    await waitFor(() => expect(scrollBody.scrollTop).toBeGreaterThan(0));
    const controlBounds = lowerControl.getBoundingClientRect();
    await expect(controlBounds.bottom).toBeLessThanOrEqual(
      footer.getBoundingClientRect().top + 1,
    );
    await expect(
      lowerControl.contains(
        document.elementFromPoint(
          controlBounds.left + controlBounds.width / 2,
          controlBounds.top + controlBounds.height / 2,
        ),
      ),
    ).toBe(true);
    await userEvent.click(lowerControl);
    await expect(lowerControl).toHaveFocus();
  },
});

export const Description = meta.story({
  name: "(Test) Description",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Invite your team"
          description="They get an email to join Acme."
          text="Dialog body content."
          actions={[{ label: "Continue", onClick: fn() }]}
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

    await expect(
      await body.findByRole("dialog", { name: "Invite your team" }),
    ).toHaveAccessibleDescription("They get an email to join Acme.");
  },
});

export const ReturnsFocus = meta.story({
  name: "(Test) Returns the focus to the opener on close",
  render: () => (
    <DialogController
      renderDialog={() => (
        <Dialog
          title="Import prompts"
          actions={[{ label: "Continue", onClick: fn() }]}
        >
          <Dialog.Body>
            {/* An autofocused field takes the focus before the dialog's own autofocus runs. */}
            <input aria-label="Prompt name" autoFocus />
          </Dialog.Body>
        </Dialog>
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
    const opener = canvas.getByRole("button", { name: "Open dialog" });

    await userEvent.click(opener);
    await userEvent.click(await body.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(opener).toHaveFocus());
  },
});

function DialogHandOff() {
  const [openCount, setOpenCount] = React.useState(0);
  const [handedOff, setHandedOff] = React.useState(0);
  const isOpen = openCount > 0 && handedOff !== openCount;
  return (
    <DialogController
      renderDialog={() => (
        <Dialog title="Invite your team">
          <Dialog.Body>
            <input aria-label="Email addresses" autoFocus />
          </Dialog.Body>
        </Dialog>
      )}
    >
      {({ openDialog: openInviteDialog }) => (
        <>
          <button
            type="button"
            onClick={() => setOpenCount((count) => count + 1)}
          >
            Open dialog
          </button>
          <DialogController
            // Unmounts the first dialog at once when it hands off.
            key={`${openCount}:${isOpen}`}
            initialState={() => (isOpen ? true : undefined)}
            renderDialog={() => (
              <Dialog
                title="Make this trace public?"
                actions={[
                  {
                    label: "Invite instead",
                    onClick: () => {
                      setHandedOff(openCount);
                      openInviteDialog();
                    },
                  },
                ]}
              >
                <Dialog.Body>Anyone with the link can view it.</Dialog.Body>
              </Dialog>
            )}
          >
            {() => null}
          </DialogController>
        </>
      )}
    </DialogController>
  );
}

export const LeavesFocusInNextDialog = meta.story({
  name: "(Test) Leaves the focus in a dialog that opened as it closed",
  render: () => <DialogHandOff />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Invite instead" }),
    );
    const field = await body.findByRole("textbox", { name: "Email addresses" });
    // The closed dialog's focus return runs after its content unmounts.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(field).toHaveFocus();
  },
});
