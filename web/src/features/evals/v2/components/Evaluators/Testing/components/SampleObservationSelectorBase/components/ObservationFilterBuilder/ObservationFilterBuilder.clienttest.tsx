import { render, screen } from "@testing-library/react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";

import { ObservationFilterBuilder } from "./ObservationFilterBuilder";

let containerWidth = 560;

vi.mock("@/src/hooks/useElementSize", () => ({
  useElementSize: () => [
    { current: null },
    { width: containerWidth, height: 200 },
  ],
}));

const columns: ColumnDefinition[] = [
  {
    id: "environment",
    name: "Environment",
    type: "stringOptions",
    internal: "environment",
    options: [{ value: "production" }],
  },
];

const filterState: FilterState = [
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
];

const renderBuilder = () =>
  render(
    <ObservationFilterBuilder
      columns={columns}
      filterState={filterState}
      onChange={vi.fn()}
      queryOnlyColumnIds={[]}
    />,
  );

describe("ObservationFilterBuilder", () => {
  beforeEach(() => {
    containerWidth = 560;
  });

  it("keeps one row and uses narrower columns when space is limited", () => {
    renderBuilder();

    const table = screen.getByRole("table");
    expect(table.parentElement?.parentElement).toHaveClass(
      "[&_td:nth-child(2)]:w-40",
      "[&_td:nth-child(3)]:w-32",
    );
  });

  it("wraps into the compact row layout when space is too narrow", () => {
    containerWidth = 420;
    renderBuilder();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Where")).toBeInTheDocument();
  });
});
