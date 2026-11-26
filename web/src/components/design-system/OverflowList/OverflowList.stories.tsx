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

export const ExactFit = meta.story({
  name: "(Test) Exact Fit",
  args: {
    ...CallerOwnedItems.input.args,
    items: ["First"],
  },
  render: (args) => (
    <div className="space-y-4">
      <div className="flex w-96 justify-center" data-testid="wide-row">
        <OverflowList {...args} />
      </div>
      <div className="w-20" data-testid="exact-row">
        <OverflowList {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const id of ["wide-row", "exact-row"]) {
      const row = within(canvas.getByTestId(id));
      await waitFor(() => {
        expect(row.getByRole("button", { name: "First" })).toBeVisible();
        expect(row.queryByRole("button", { name: "+1" })).toBeNull();
      });
    }
  },
});

export const OverflowAlignment = meta.story({
  name: "(Test) Overflow Alignment",
  args: CallerOwnedItems.input.args,
  render: (args) => (
    <div className="space-y-4">
      {(["center", "end"] as const).map((alignment) => (
        <div key={alignment} className="w-56" data-testid={alignment}>
          <OverflowList {...args} alignment={alignment} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const alignment of ["center", "end"]) {
      const container = canvas.getByTestId(alignment);
      const row = within(container);
      await waitFor(() => {
        expect(row.getByRole("button", { name: "+2" })).toBeVisible();
      });
      const first = row.getByRole("button", { name: "First" });
      const overflow = row.getByRole("button", { name: "+2" });
      const bounds = container.getBoundingClientRect();
      const left = first.getBoundingClientRect().left;
      const right = overflow.getBoundingClientRect().right;
      if (alignment === "end") {
        await expect(Math.abs(bounds.right - right)).toBeLessThanOrEqual(1);
      } else {
        await expect(
          Math.abs(left - bounds.left - (bounds.right - right)),
        ).toBeLessThanOrEqual(1);
      }
    }
  },
});

export const OverflowWidthDependsOnCount = meta.story({
  name: "(Test) Overflow Width Depends On Count",
  args: {
    ...CallerOwnedItems.input.args,
    alignment: "center",
    renderOverflow: ({ overflowItemCount }) => (
      <button
        type="button"
        // Wide when few items overflow, narrow when many do — the same
        // +N width coupling chart legends have.
        style={{ width: overflowItemCount >= 3 ? 24 : 96 }}
      >
        +{overflowItemCount}
      </button>
    ),
  },
  render: (args) => {
    const [forceWideOverflow, setForceWideOverflow] = useState(false);

    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setForceWideOverflow(true)}>
          Widen overflow
        </button>
        <div className="w-[220px] min-w-0 overflow-hidden">
          <OverflowList
            {...args}
            renderOverflow={
              forceWideOverflow
                ? ({ overflowItemCount }) => (
                    <button type="button" style={{ width: 200 }}>
                      +{overflowItemCount}
                    </button>
                  )
                : args.renderOverflow
            }
          />
        </div>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByRole("button", { name: /^\+\d+$/ })).toBeVisible();
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Widen overflow" }),
    );
    await waitFor(() => {
      expect(
        canvas.queryByRole("button", { name: "First" }),
      ).not.toBeInTheDocument();
      expect(canvas.getByRole("button", { name: "+4" })).toBeVisible();
    });
  },
});
