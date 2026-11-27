import {
  eventsEvalFilterColumns,
  type ColumnDefinition,
  type FilterState,
} from "@langfuse/shared";
import { expect, fn, waitFor, within } from "storybook/test";

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

async function withVitestViewport<T>(
  width: number,
  height: number,
  run: () => Promise<T>,
): Promise<T> {
  const vitestPage =
    "__vitest_browser__" in globalThis
      ? (await import("vitest/browser")).page
      : null;
  const previous = { width: window.innerWidth, height: window.innerHeight };
  await vitestPage?.viewport(width, height);
  try {
    return await run();
  } finally {
    await vitestPage?.viewport(previous.width, previous.height);
  }
}

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
    <div className="w-[560px]">
      <ObservationFilterBuilder {...storyArgs} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await withVitestViewport(1024, 768, async () => {
      const canvas = within(canvasElement);
      await waitFor(() => {
        expect(canvas.getByRole("table")).toBeInTheDocument();
      });
    });
  },
});

export const Compact = meta.story({
  name: "(Test) Compact row layout",
  args,
  render: (storyArgs) => (
    <div className="w-[420px]">
      <ObservationFilterBuilder {...storyArgs} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.queryByRole("table")).not.toBeInTheDocument();
      expect(canvas.getByText("Where")).toBeInTheDocument();
    });
  },
});
