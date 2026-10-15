import { useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Dialog } from "../Dialog/Dialog";
import { DialogController } from "../DialogController/DialogController";
import { SortableList } from "./SortableList";

const meta = preview.meta({ component: SortableList });

export const TestKeyboardSortingInDialog = meta.story({
  name: "(Test) Keyboard Sorting Inside a Dialog",
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
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Reorder choices" }),
      ).not.toBeInTheDocument(),
    );
  },
});
