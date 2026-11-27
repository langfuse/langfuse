/* eslint-disable @repo/prefer-stories-over-client-tests */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ColumnDefinition, FilterState } from "@langfuse/shared";

import { ObservationFilterBuilder } from "./ObservationFilterBuilder";

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

describe("ObservationFilterBuilder", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a selected query-only column and preserves unavailable filters on removal", () => {
    const onChange = vi.fn();
    const unavailable = { ...filterState[0], column: "unavailable" };
    render(
      <ObservationFilterBuilder
        columns={columns}
        filterState={[...filterState, unavailable]}
        onChange={onChange}
        queryOnlyColumnIds={["environment"]}
      />,
    );

    expect(screen.getByLabelText("Column")).toHaveTextContent("Environment");
    fireEvent.click(screen.getByRole("button", { name: "Remove filter 1" }));
    expect(onChange).toHaveBeenCalledWith([unavailable]);
  });

  it("shows externally replaced filters without emitting edits", () => {
    const props = { columns, onChange: vi.fn(), queryOnlyColumnIds: [] };
    const { rerender } = render(
      <ObservationFilterBuilder {...props} filterState={[]} />,
    );
    rerender(<ObservationFilterBuilder {...props} filterState={filterState} />);
    expect(screen.getByLabelText("Column")).toHaveTextContent("Environment");
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
