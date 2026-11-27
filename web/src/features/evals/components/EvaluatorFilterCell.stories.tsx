import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import type { FilterState } from "@langfuse/shared";
import { formatFilterPreview } from "@/src/components/table/table-view-presets/lib/viewPreview";
import { EvaluatorFilterCell } from "@/src/features/evals/components/EvaluatorFilterCell";

const SHORT_FILTER = [
  {
    type: "stringOptions",
    column: "environment",
    operator: "any of",
    value: ["prod"],
  },
] satisfies FilterState;

const LONG_NAME_FILTER = [
  {
    type: "stringOptions",
    column: "Name",
    operator: "any of",
    value: ["Chat about billing and account recovery"],
  },
] satisfies FilterState;

const LONG_FILTER = [
  ...LONG_NAME_FILTER,
  {
    type: "arrayOptions",
    column: "Tags",
    operator: "any of",
    value: ["web_search_"],
  },
] satisfies FilterState;

const SHORT_FILTER_TITLE = SHORT_FILTER.map(formatFilterPreview).join(" · ");

async function assertNoHorizontalScrollContainer(
  view: Window,
  root: HTMLElement,
) {
  const overflowX = view.getComputedStyle(root).overflowX;
  await expect(overflowX === "hidden" || overflowX === "clip").toBe(true);

  for (const node of root.querySelectorAll("*")) {
    if (!(node instanceof HTMLElement)) continue;
    const descendantOverflowX = view.getComputedStyle(node).overflowX;
    await expect(descendantOverflowX).not.toBe("auto");
    await expect(descendantOverflowX).not.toBe("scroll");
  }

  await expect(root.querySelector(".overflow-x-auto")).toBeNull();
}

const meta = preview.meta({
  component: EvaluatorFilterCell,
});

export default meta;

export const Default = meta.story({
  args: {
    filterState: SHORT_FILTER,
  },
});

export const Overflowing = meta.story({
  args: {
    filterState: LONG_FILTER,
  },
  render: (args) => (
    <div className="w-[200px] overflow-hidden">
      <EvaluatorFilterCell {...args} />
    </div>
  ),
});

export const NoPerCellHorizontalScrollbar = meta.story({
  name: "(Test) No per-cell horizontal scrollbar",
  args: {
    filterState: SHORT_FILTER,
  },
  play: async ({ canvas }) => {
    const cell = canvas.getByTitle(SHORT_FILTER_TITLE);
    const view = cell.ownerDocument.defaultView;
    if (!view) {
      throw new Error("Expected a document view");
    }
    await assertNoHorizontalScrollContainer(view, cell);
  },
});

export const ExposesFullFilterValueOnHover = meta.story({
  name: "(Test) Exposes full filter value on hover",
  args: {
    filterState: LONG_NAME_FILTER,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Name")).toBeInTheDocument();
    await expect(
      canvas.getByTitle("Name any of Chat about billing and account recovery"),
    ).toBeInTheDocument();
  },
});
