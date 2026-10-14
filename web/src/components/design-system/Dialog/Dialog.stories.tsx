import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

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

export const SelectOptionsInModal = meta.story({
  name: "(Test) Select options in modal",
  render: () => {
    const [config, setConfig] = React.useState("");
    const [dataType, setDataType] = React.useState("");

    return (
      <DialogController
        renderDialog={() => (
          <Dialog title="Choose score config">
            <Dialog.Body>
              <SelectInput
                aria-label="Score config"
                value={config}
                onValueChange={setConfig}
                placeholder="Choose score config"
                search={{ placeholder: "Search score configs..." }}
                options={[
                  { value: "quality", label: "Quality" },
                  { value: "helpfulness", label: "Helpfulness" },
                ]}
              />
              <SelectInput
                aria-label="Data type"
                value={dataType}
                onValueChange={setDataType}
                placeholder="Choose type"
                options={[
                  { value: "numeric", label: "Numeric" },
                  { value: "boolean", label: "Boolean" },
                ]}
              />
            </Dialog.Body>
          </Dialog>
        )}
      >
        {({ openDialog }) => <Button text="Open dialog" onClick={openDialog} />}
      </DialogController>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    await userEvent.click(body.getByRole("combobox", { name: "Score config" }));
    await userEvent.type(
      body.getByPlaceholderText("Search score configs..."),
      "Quality",
    );
    await userEvent.click(await body.findByRole("option", { name: "Quality" }));
    await expect(
      body.getByRole("combobox", { name: "Score config" }),
    ).toHaveTextContent("Quality");

    await userEvent.click(body.getByRole("combobox", { name: "Data type" }));
    await userEvent.click(await body.findByRole("option", { name: "Boolean" }));
    await expect(
      body.getByRole("combobox", { name: "Data type" }),
    ).toHaveTextContent("Boolean");
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
            <Button text="Create score config" onClick={fn()} />
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
      name: "Create score config",
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
