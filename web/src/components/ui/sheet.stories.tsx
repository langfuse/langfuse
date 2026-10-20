import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button as TriggerButton } from "./button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";

const meta = preview.meta({ component: SheetContent });

export const NestedInteractiveOverlays = meta.story({
  name: "(Test) Picker and Nested Dialog Remain Accessible",
  render: () => {
    const [value, setValue] = useState("");
    return (
      <Sheet defaultOpen>
        <SheetContent className="flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>Setup</SheetTitle>
          </SheetHeader>
          <Input aria-label="Draft name" defaultValue="Keep this draft" />
          <SelectInput
            aria-label="Choice"
            value={value}
            onValueChange={setValue}
            placeholder="Choose"
            options={[{ value: "first", label: "First option" }]}
          />
          <DialogController
            renderDialog={() => (
              <Dialog title="Edit choice" actions={[{ label: "Save" }]}>
                <Dialog.Body>
                  <Input aria-label="Choice name" defaultValue="First option" />
                </Dialog.Body>
              </Dialog>
            )}
          >
            {({ openDialog }) => (
              <Button text="Edit choice" onClick={openDialog} />
            )}
          </DialogController>
        </SheetContent>
      </Sheet>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("combobox", { name: "Choice" }));
    const option = await body.findByRole("option", { name: "First option" });
    await expect(option.closest('[aria-hidden="true"]')).toBeNull();
    await userEvent.click(option);
    await userEvent.click(body.getByRole("button", { name: "Edit choice" }));
    const dialog = await body.findByRole("dialog", { name: "Edit choice" });
    await expect(dialog.closest('[aria-hidden="true"]')).toBeNull();
    await waitFor(() => {
      const rect = dialog.getBoundingClientRect();
      expect(
        Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2),
      ).toBeLessThan(2);
    });
    const name = within(dialog).getByRole("textbox", { name: "Choice name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Updated choice");
    await expect(name).toHaveValue("Updated choice");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Edit choice" }),
      ).not.toBeInTheDocument(),
    );
    await expect(body.getByRole("dialog", { name: "Setup" })).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(body.getByRole("textbox", { name: "Draft name" })).toHaveValue(
      "Keep this draft",
    );
    await expect(
      body
        .getByRole("dialog", { name: "Setup" })
        .contains(canvasElement.ownerDocument.activeElement),
    ).toBe(true);
  },
});

export const EscapeDismissesNestedMenu = meta.story({
  name: "(Test) Escape Dismisses Menu Before Sheet",
  args: { onEscapeKeyDown: fn() },
  render: (args) => (
    <Sheet defaultOpen>
      <SheetContent {...args}>
        <SheetHeader>
          <SheetTitle>Setup</SheetTitle>
        </SheetHeader>
        <Input aria-label="Draft name" defaultValue="Keep this draft" />
        <DialogController
          renderDialog={() => (
            <Dialog title="Create choice" actions={[{ label: "Save" }]}>
              <Dialog.Body>
                <Input aria-label="Choice name" />
              </Dialog.Body>
            </Dialog>
          )}
        >
          {({ openDialog }) => (
            <DropdownMenu
              ariaLabel="Choices"
              search={{ placeholder: "Search choices" }}
              items={[
                {
                  type: "item",
                  id: "create",
                  title: "Create choice",
                  onClick: openDialog,
                },
              ]}
            >
              {({ getTriggerProps }) => (
                <TriggerButton {...getTriggerProps()}>Add choice</TriggerButton>
              )}
            </DropdownMenu>
          )}
        </DialogController>
      </SheetContent>
    </Sheet>
  ),
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: "Add choice" }));
    await userEvent.type(
      body.getByRole("searchbox", { name: "Search choices" }),
      "create",
    );
    await userEvent.keyboard("{Escape}");
    await expect(
      body.queryByRole("menu", { name: "Choices" }),
    ).not.toBeInTheDocument();
    await expect(body.getByRole("dialog", { name: "Setup" })).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(args.onEscapeKeyDown).toHaveBeenCalled();
    await userEvent.click(body.getByRole("button", { name: "Add choice" }));
    await userEvent.click(
      body.getByRole("menuitem", { name: "Create choice" }),
    );
    await expect(
      body.queryByRole("menu", { name: "Choices" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(body.getByRole("dialog", { name: "Create choice" })).toBeVisible(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Create choice" }),
      ).not.toBeInTheDocument(),
    );
    await expect(body.getByRole("dialog", { name: "Setup" })).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(body.getByRole("textbox", { name: "Draft name" })).toHaveValue(
      "Keep this draft",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Setup" }),
      ).not.toBeInTheDocument(),
    );
  },
});
