import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import {
  DataTableControls,
  type QueryFilter,
} from "@/src/components/table/data-table-controls";

describe("DataTableControls", () => {
  it("renders custom sidebar content above the first filter section", () => {
    const queryFilter: QueryFilter = {
      filters: [
        {
          type: "categorical",
          column: "environment",
          label: "Environment",
          loading: false,
          expanded: true,
          isActive: false,
          isDisabled: false,
          onReset: jest.fn(),
          value: [],
          options: ["default"],
          counts: new Map([["default", 1]]),
          onChange: jest.fn(),
        },
      ],
      expanded: ["environment"],
      onExpandedChange: jest.fn(),
      clearAll: jest.fn(),
      isFiltered: false,
      setFilterState: jest.fn(),
    };

    const { container } = render(
      <DataTableControls
        queryFilter={queryFilter}
        topContent={<div>Sidebar help</div>}
      />,
    );

    expect(screen.getByText("Sidebar help")).toBeInTheDocument();
    expect(screen.getByText("Environment")).toBeInTheDocument();

    const markup = container.textContent ?? "";
    expect(markup.indexOf("Sidebar help")).toBeLessThan(
      markup.indexOf("Environment"),
    );
  });
});
