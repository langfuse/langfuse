import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import type { FilterState } from "@langfuse/shared";
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
  play: async ({ canvasElement }) => {
    const cell = canvasElement.firstElementChild;
    if (!(cell instanceof HTMLElement)) {
      throw new Error("Expected EvaluatorFilterCell root element");
    }
    const overflowX =
      cell.ownerDocument.defaultView!.getComputedStyle(cell).overflowX;
    await expect(overflowX).not.toBe("auto");
    await expect(overflowX).not.toBe("scroll");
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
