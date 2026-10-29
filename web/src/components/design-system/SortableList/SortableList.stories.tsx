import { useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Dialog } from "../Dialog/Dialog";
import { DialogController } from "../DialogController/DialogController";
import { SortableList } from "./SortableList";

const meta = preview.meta({ component: SortableList });

export const TestMixedHeights = meta.story({
  name: "(Test) Different Height Rows Keep Their Size While Dragging",
  args: {
    items: ["Short", "Tall"],
    getId: String,
    getLabel: String,
    onReorder: fn(),
    renderItem: (item) => (
      <div className={item === "Tall" ? "h-40 border p-2" : "h-10 border p-2"}>
        {String(item)}
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = canvas.getByRole("button", { name: "Reorder Short" });
    const row = handle.closest("li")!;
    const target = canvas
      .getByRole("button", { name: "Reorder Tall" })
      .closest("li")!;
    const original = row.getBoundingClientRect();
    const destination = target.getBoundingClientRect();
    await userEvent.pointer({
      target: handle,
      keys: "[MouseLeft>]",
      coords: { clientX: original.left + 10, clientY: original.top + 16 },
    });
    await userEvent.pointer({
      target: handle,
      coords: { clientX: original.left + 10, clientY: original.top + 24 },
    });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    await userEvent.pointer({
      target,
      coords: {
        clientX: original.left + 10,
        clientY: destination.top + destination.height / 2,
      },
    });
    await waitFor(() =>
      expect(target.getBoundingClientRect().top).toBeLessThan(destination.top),
    );
    await expect(
      Math.abs(row.getBoundingClientRect().height - original.height),
    ).toBeLessThan(1);
    await userEvent.pointer({ keys: "[/MouseLeft]" });
  },
});

export const TestSortingInDialog = meta.story({
  name: "(Test) Sorting Inside a Dialog",
  args: {
    items: ["First", "Second"],
    getId: String,
    getLabel: String,
    onReorder: fn(),
    renderItem: String,
  },
  render: (args) => {
    const [items, setItems] = useState(args.items);
    return (
      <DialogController<boolean>
        initialState={() => true}
        renderDialog={() => (
          <Dialog title="Reorder choices" stopPropagationOnEnterSpace={false}>
            <Dialog.Body>
              <SortableList
                {...args}
                items={items}
                aria-label="Choices"
                onReorder={(from, to) => {
                  setItems(arrayMove(items, from, to));
                  args.onReorder(from, to);
                }}
              />
            </Dialog.Body>
          </Dialog>
        )}
      >
        {() => null}
      </DialogController>
    );
  },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    body.getByRole("button", { name: "Reorder Second" }).focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard(" ");
    await waitFor(() => expect(args.onReorder).toHaveBeenCalledWith(1, 0));
    const rows = within(
      body.getByRole("list", { name: "Choices" }),
    ).getAllByRole("listitem");
    await expect(rows[0]).toHaveTextContent("Second");
    body.getByRole("button", { name: "Reorder Second" }).focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");
    await expect(args.onReorder).toHaveBeenCalledTimes(1);
    await expect(
      body.getByRole("dialog", { name: "Reorder choices" }),
    ).toHaveAttribute("data-state", "open");
    await expect(
      body.getByRole("button", { name: "Reorder Second" }),
    ).not.toHaveAttribute("aria-pressed", "true");
    const handle = body.getByRole("button", { name: "Reorder Second" });
    const bounds = handle.getBoundingClientRect();
    await userEvent.pointer({
      target: handle,
      keys: "[MouseLeft>]",
      coords: { clientX: bounds.left + 5, clientY: bounds.top + 5 },
    });
    await userEvent.pointer({
      target: handle,
      coords: { clientX: bounds.left + 5, clientY: bounds.top + 15 },
    });
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    await userEvent.keyboard("{Escape}");
    await expect(
      body.getByRole("dialog", { name: "Reorder choices" }),
    ).toHaveAttribute("data-state", "open");
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
    await expect(args.onReorder).toHaveBeenCalledTimes(1);
    await userEvent.pointer({ keys: "[/MouseLeft]" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Reorder choices" }),
      ).not.toBeInTheDocument(),
    );
  },
});
