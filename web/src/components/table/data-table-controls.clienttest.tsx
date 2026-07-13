import { fireEvent, render, screen } from "@testing-library/react";
import { Accordion } from "@/src/components/ui/accordion";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  CategoricalFacet,
  DataTableControls,
  type QueryFilter,
} from "./data-table-controls";
import type {
  CategoricalUIFilter,
  UIFilter,
} from "@/src/features/filters/hooks/useSidebarFilterState";

// Radix ScrollArea (wrapping the facet list) needs ResizeObserver, which
// jsdom does not implement.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("CategoricalFacet", () => {
  it("shows selected values even when the backend returns no options", () => {
    render(
      <Accordion type="multiple" value={["type"]}>
        <CategoricalFacet
          label="Type"
          filterKey="type"
          expanded
          loading={false}
          options={[]}
          counts={new Map()}
          value={["AGENT"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    expect(screen.getByText("AGENT")).toBeInTheDocument();
    expect(screen.queryByText("No options found")).not.toBeInTheDocument();
  });

  it("shows Clear for active selected values even when the backend returns no options", () => {
    render(
      <Accordion type="multiple" value={["type"]}>
        <CategoricalFacet
          label="Type"
          filterKey="type"
          expanded
          loading={false}
          options={[]}
          counts={new Map()}
          value={["AGENT"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    expect(screen.getByLabelText("Clear Type filter")).toBeInTheDocument();
  });

  it("pins a selected option to the top of a long list so it is visible without 'Show more'", () => {
    // 20 options, one selected near the bottom. Without pinning the selected
    // value sits below the 12-item cap and is hidden behind "Show more".
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={["opt-18"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    // The list is long enough to be capped...
    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();

    // ...yet the selected value is shown despite sitting at position 19,
    // and it precedes the first unselected option in DOM order (pinned to top).
    const selected = screen.getByText("opt-18");
    const firstUnselected = screen.getByText("opt-0");
    expect(selected).toBeInTheDocument();
    expect(
      selected.compareDocumentPosition(firstUnselected) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the 'Show more' cap when every option is reported selected (no-filter default)", () => {
    // useSidebarFilterState returns value === options when no filter is applied
    // (computeSelectedValues). That all-selected default must NOT be treated as
    // a pinned selection — doing so would render the entire list with no cap.
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={options}
          onChange={() => {}}
          isActive={false}
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    // The cap is preserved: "Show more" still renders and a deep value stays hidden.
    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("opt-19")).not.toBeInTheDocument();
  });

  it("never bypasses the cap, even for a large selection", () => {
    // A large selection (e.g. a "none of" include-set) must still respect the
    // visible-count cap rather than dumping every value into the DOM.
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    const selected = options.slice(0, 18); // 18 of 20 selected
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={selected}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();
    // Only the capped number of rows render, not all 18 selected.
    expect(screen.getAllByRole("checkbox").length).toBeLessThanOrEqual(12);
  });

  it("pins the excluded (unchecked) options to the top for none-of filters (LFE-10717)", () => {
    // Under the checked=kept model a `none of [opt-18]` exclusion reports
    // every option EXCEPT opt-18 as selected. The applied filter — the thing
    // LFE-10494 pinning exists to surface — is the excluded value, so it must
    // be pinned above the kept options instead of sinking below the cap.
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    const value = options.filter((option) => option !== "opt-18");
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={value}
          operator="none of"
          onOperatorChange={() => {}}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    // The cap still applies...
    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();

    // ...yet the excluded value is visible despite sitting at position 19,
    // and it precedes the first kept option in DOM order (pinned to top).
    const excluded = screen.getByText("opt-18");
    const firstKept = screen.getByText("opt-0");
    expect(excluded).toBeInTheDocument();
    expect(
      excluded.compareDocumentPosition(firstKept) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not reorder short, fully-visible lists", () => {
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={["a", "b", "c"]}
          counts={new Map()}
          value={["c"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    // No cap, no "Show more": the natural order is preserved (a, b, c) — the
    // selected "c" is NOT pulled above "a".
    const a = screen.getByText("a");
    const c = screen.getByText("c");
    expect(
      a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("DataTableControls facet ordering", () => {
  const categoricalFilter = (
    column: string,
    label: string,
    isActive: boolean,
  ): CategoricalUIFilter => ({
    type: "categorical",
    column,
    label,
    loading: false,
    expanded: false,
    isActive,
    isDisabled: false,
    onReset: () => {},
    value: isActive ? ["x"] : [],
    options: ["x", "y"],
    counts: new Map(),
    onChange: () => {},
  });

  const queryFilter = (filters: UIFilter[]): QueryFilter => ({
    filters,
    expanded: [],
    onExpandedChange: () => {},
    clearAll: () => {},
    isFiltered: filters.some((f) => f.isActive),
    setFilterState: () => {},
  });

  const labelOrder = (first: string, second: string) => {
    const a = screen.getByText(first);
    const b = screen.getByText(second);
    return Boolean(
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  };

  it("promotes facets with an active filter above inactive ones", () => {
    render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter([
            categoricalFilter("alpha", "Alpha", false),
            categoricalFilter("beta", "Beta", true),
          ])}
        />
      </TooltipProvider>,
    );

    // Config order is [Alpha, Beta]; active Beta renders first.
    expect(labelOrder("Beta", "Alpha")).toBe(true);
  });

  it("freezes the order on first interaction so facets don't jump mid-click", () => {
    const filters = [
      categoricalFilter("alpha", "Alpha", false),
      categoricalFilter("beta", "Beta", true),
    ];
    const { rerender } = render(
      <TooltipProvider>
        <DataTableControls queryFilter={queryFilter(filters)} />
      </TooltipProvider>,
    );
    expect(labelOrder("Beta", "Alpha")).toBe(true);

    // Any interaction inside the facet LIST freezes the current order
    // (header actions like Clear all deliberately stay live)…
    fireEvent.keyDown(screen.getByText("Alpha"));

    // …so Alpha becoming active (as a click on its checkbox would make it)
    // must NOT re-sort it above Beta while the user is working in the list.
    rerender(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter([
            categoricalFilter("alpha", "Alpha", true),
            categoricalFilter("beta", "Beta", true),
          ])}
        />
      </TooltipProvider>,
    );
    expect(labelOrder("Beta", "Alpha")).toBe(true);
  });

  it("tracks activity live before any interaction (late-arriving URL filters)", () => {
    const { rerender } = render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter([
            categoricalFilter("alpha", "Alpha", false),
            categoricalFilter("beta", "Beta", false),
          ])}
        />
      </TooltipProvider>,
    );
    expect(labelOrder("Alpha", "Beta")).toBe(true);

    // Filters decoded from the URL a few renders after mount still promote.
    rerender(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter([
            categoricalFilter("alpha", "Alpha", false),
            categoricalFilter("beta", "Beta", true),
          ])}
        />
      </TooltipProvider>,
    );
    expect(labelOrder("Beta", "Alpha")).toBe(true);
  });

  it("shows the 'what is selected' summary in the facet header", () => {
    render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter([
            {
              ...categoricalFilter("alpha", "Alpha", true),
              value: ["x", "y"],
              options: ["x", "y", "z"],
            },
            categoricalFilter("beta", "Beta", false),
          ])}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    // Inactive checkbox facet reads "All" — all-checked means no filter.
    expect(screen.getByText("All")).toBeInTheDocument();
  });
});
