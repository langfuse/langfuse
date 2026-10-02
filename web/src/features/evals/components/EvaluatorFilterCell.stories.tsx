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

const LONG_FILTER = [
  {
    type: "stringOptions",
    column: "Name",
    operator: "any of",
    value: ["Chat about billing and account recovery"],
  },
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
