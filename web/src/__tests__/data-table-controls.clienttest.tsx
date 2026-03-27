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
          disabledReason="Sidebar filters are disabled while the search bar contains grouped or chained Lucene filters. Simplify to flat AND clauses or clear the search bar to edit sidebar filters."
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText(
        "Sidebar filters are disabled while the search bar contains grouped or chained Lucene filters. Simplify to flat AND clauses or clear the search bar to edit sidebar filters.",
      ),
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
});
