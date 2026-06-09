import { render, screen } from "@testing-library/react";
import {
  DataTableControls,
  type QueryFilter,
} from "@/src/components/table/data-table-controls";
import { TooltipProvider } from "@/src/components/ui/tooltip";

jest.mock("../features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: false,
    region: undefined,
  }),
}));

describe("DataTableControls", () => {
  it("disables the sidebar controls when a complex lucene query is active", () => {
    const queryFilter: QueryFilter = {
      filters: [
        {
          type: "string",
          column: "statusMessage",
          label: "Status Message",
          loading: false,
          expanded: true,
          isActive: true,
          isDisabled: false,
          onReset: jest.fn(),
          value: "timeout",
          onChange: jest.fn(),
        },
      ],
      expanded: ["statusMessage"],
      onExpandedChange: jest.fn(),
      clearAll: jest.fn(),
      isFiltered: true,
      setFilterState: jest.fn(),
    };

    render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter}
          disabledReason="Sidebar is disabled for complex search bar filters."
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText("Sidebar is disabled for complex search bar filters."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Clear all",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("textbox").closest("fieldset") as HTMLFieldSetElement)
        .disabled,
    ).toBe(true);
  });

  it("surfaces synced wildcard text filters in categorical text mode", () => {
    const queryFilter: QueryFilter = {
      filters: [
        {
          type: "categorical",
          column: "environment",
          label: "Environment",
          loading: false,
          expanded: true,
          isActive: true,
          isDisabled: false,
          onReset: jest.fn(),
          value: [],
          options: ["default", "production"],
          counts: new Map(),
          onChange: jest.fn(),
          textFilters: [
            {
              operator: "starts with",
              value: "prod",
            },
          ],
          onTextFilterAdd: jest.fn(),
          onTextFilterRemove: jest.fn(),
        },
      ],
      expanded: ["environment"],
      onExpandedChange: jest.fn(),
      clearAll: jest.fn(),
      isFiltered: true,
      setFilterState: jest.fn(),
    };

    render(
      <TooltipProvider>
        <DataTableControls queryFilter={queryFilter} />
      </TooltipProvider>,
    );

    expect(screen.getAllByText("starts with").length).toBeGreaterThan(0);
    expect(screen.getByText("prod")).toBeTruthy();
  });
});
