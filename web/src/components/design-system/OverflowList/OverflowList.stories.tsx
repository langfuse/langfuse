import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { OverflowList } from "./OverflowList";

const onItemClick = fn();

const meta = preview.meta({
  component: OverflowList<string>,
});

export const CallerOwnedItems = meta.story({
  name: "(Test) Caller-Owned Items",
  args: {
    items: ["First", "Second", "Third", "Fourth"],
    additionalOverflowCount: 0,
    getKey: (item) => item,
    renderItem: (item, { getItemProps }) => (
      <button
        type="button"
        {...getItemProps({
          className: "h-6 w-20",
          onClick: () => onItemClick(item),
          title: item,
        })}
      >
        {item}
      </button>
    ),
    renderOverflow: ({ overflowItemCount }) => (
      <button type="button">+{overflowItemCount}</button>
    ),
  },
  render: (args) => {
    const [expanded, setExpanded] = useState(false);

    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : "Expand"}
        </button>
        <div style={{ width: expanded ? 400 : 220 }}>
          <OverflowList {...args} />
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "+2" })).toBeVisible();
      expect(
        canvas.queryByRole("button", { name: "Third" }),
      ).not.toBeInTheDocument();
    });
    const firstItem = canvas.getByRole("button", { name: "First" });
    await expect(firstItem).toHaveAttribute("title", "First");
    await userEvent.click(firstItem);
    await expect(onItemClick).toHaveBeenCalledWith("First");

    await userEvent.click(canvas.getByRole("button", { name: "Expand" }));
    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "Fourth" })).toBeVisible();
      expect(
        canvas.queryByRole("button", { name: "+2" }),
      ).not.toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole("button", { name: "Collapse" }));
    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "+2" })).toBeVisible();
      expect(
        canvas.queryByRole("button", { name: "Third" }),
      ).not.toBeInTheDocument();
    });
  },
});
