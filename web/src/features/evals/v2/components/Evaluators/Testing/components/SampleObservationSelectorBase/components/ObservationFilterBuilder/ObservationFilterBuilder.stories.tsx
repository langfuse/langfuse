import {
  eventsEvalFilterColumns,
  type ColumnDefinition,
  type FilterState,
} from "@langfuse/shared";
import { expect, fn, within } from "storybook/test";

import preview from "../../../../../../../../../../../.storybook/preview";
import { ObservationFilterBuilder } from "./ObservationFilterBuilder";

const columns: ColumnDefinition[] = eventsEvalFilterColumns.map((column) => {
  if (column.id !== "environment" || column.type !== "stringOptions") {
    return column;
  }
  return {
    ...column,
    options: [{ value: "production" }, { value: "sdk-experiment" }],
  };
});

const filterState = [
  {
    column: "isRootObservation",
    type: "boolean",
    operator: "=",
    value: true,
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
  {
    column: "experimentId",
    type: "null",
    operator: "is null",
    value: "",
  },
] satisfies FilterState;

const meta = preview.meta({ component: ObservationFilterBuilder });

const args = {
  columns,
  filterState,
  onChange: fn(),
  queryOnlyColumnIds: ["metadata"],
};

export const Wide = meta.story({
  args,
  render: (storyArgs) => (
    <div className="max-w-5xl">
      <ObservationFilterBuilder {...storyArgs} />
    </div>
  ),
});

export const Narrow = meta.story({
  name: "(Test) Narrow table layout",
  args,
  render: (storyArgs) => (
    <div className="w-[560px] max-w-full">
      <ObservationFilterBuilder {...storyArgs} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table")).toBeInTheDocument();
  },
});

export const Compact = meta.story({
  name: "(Test) Compact row layout",
  args,
  render: (storyArgs) => (
    <div className="w-[420px] max-w-full">
      <ObservationFilterBuilder {...storyArgs} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
    await expect(canvas.getByText("Where")).toBeInTheDocument();
  },
});
