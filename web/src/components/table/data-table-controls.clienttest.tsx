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

// Spy on the posthog client so capture calls (event name + payload) can be
// asserted at the wrapper seam.
const captureSpy = vi.fn();
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: captureSpy }),
}));

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

  it("reveals values in portions — 'more' means more, not all — and collapses back", () => {
    // 80 options: one "Show more" click must reveal the next chunk (+50),
    // not the entire list.
    const options = Array.from({ length: 80 }, (_, i) => `opt-${i}`);
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={[]}
          onChange={() => {}}
          isActive={false}
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      { wrapper: TooltipProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Show more values" }));
    // One portion revealed (12 + 50 = 62 values)…
    expect(screen.getByText("opt-61")).toBeInTheDocument();
    // …but NOT the whole list…
    expect(screen.queryByText("opt-62")).not.toBeInTheDocument();
    // …and both continue and collapse affordances are offered.
    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();
    const collapse = screen.getByRole("button", {
      name: "Show fewer values",
    });
    // Collapsing re-applies the cap.
    fireEvent.click(collapse);
    expect(screen.queryByText("opt-61")).not.toBeInTheDocument();
    expect(screen.queryByText("opt-12")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show fewer values" }),
    ).not.toBeInTheDocument();
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

  it("disables 'None of' with an explanation while it would be a no-op", () => {
    // No persisted filter (operator undefined): switching to none-of is a
    // deliberate no-op in the state model, so the tab must read disabled
    // instead of silently doing nothing.
    render(
      <Accordion type="multiple" value={["tags"]}>
        <CategoricalFacet
          label="Tags"
          filterKey="tags"
          expanded
          loading={false}
          options={["a", "b"]}
          counts={new Map()}
          value={["a", "b"]}
          onChange={() => {}}
          operator={undefined}
          onOperatorChange={() => {}}
          isActive={false}
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByRole("tab", { name: "None of" })).toBeDisabled();

    // With a persisted selection the operator conversion is meaningful.
    render(
      <Accordion type="multiple" value={["tags2"]}>
        <CategoricalFacet
          label="Tags2"
          filterKey="tags2"
          expanded
          loading={false}
          options={["a", "b"]}
          counts={new Map()}
          value={["a"]}
          onChange={() => {}}
          operator="any of"
          onOperatorChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
      { wrapper: TooltipProvider },
    );
    const tabs = screen.getAllByRole("tab", { name: "None of" });
    expect(tabs[tabs.length - 1]).toBeEnabled();
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
    // enables the Select/Text mode tabs in tests that need them
    onTextFilterAdd: () => {},
    onTextFilterRemove: () => {},
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

  it("re-sorts immediately when a facet's activity changes", () => {
    const { rerender } = render(
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

    // Alpha becoming active promotes it right away (config order among
    // equally-active facets)…
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
    expect(labelOrder("Alpha", "Beta")).toBe(true);

    // …and Beta clearing demotes it below the still-active Alpha.
    rerender(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter([
            categoricalFilter("alpha", "Alpha", true),
            categoricalFilter("beta", "Beta", false),
          ])}
        />
      </TooltipProvider>,
    );
    expect(labelOrder("Alpha", "Beta")).toBe(true);
  });

  it("captures sidebar_toggled and facet_mode_switched with their dimensions", () => {
    captureSpy.mockClear();
    render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={{
            ...queryFilter([categoricalFilter("alpha", "Alpha", true)]),
            // facet expanded so the Select/Text mode tabs render
            expanded: ["alpha"],
            isV4: true,
          }}
        />
      </TooltipProvider>,
    );

    // Header hide button -> one sidebar_toggled with trigger + dimension.
    fireEvent.click(screen.getByRole("button", { name: "Hide filters" }));
    const toggled = captureSpy.mock.calls.filter(
      ([event]) => event === "filters:sidebar_toggled",
    );
    expect(toggled).toHaveLength(1);
    expect(toggled[0][1]).toMatchObject({
      open: false,
      trigger: "header",
      isV4: true,
    });

    // Facet mode tab -> one facet_mode_switched carrying the column.
    // (Radix Tabs activate on mousedown, not click.)
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Text" }));
    fireEvent.click(screen.getByRole("tab", { name: "Text" }));
    const switched = captureSpy.mock.calls.filter(
      ([event]) => event === "filters:facet_mode_switched",
    );
    expect(switched).toHaveLength(1);
    expect(switched[0][1]).toMatchObject({
      column: "alpha",
      mode: "text",
      isV4: true,
    });

    // Privacy: no payload of any captured event carries a filter value.
    for (const [, payload] of captureSpy.mock.calls) {
      expect(JSON.stringify(payload ?? {})).not.toContain('"x"');
    }
  });

  it("expands and collapses all facets from the header toggle", () => {
    const expandedChanges: string[][] = [];
    const qf = queryFilter([
      categoricalFilter("alpha", "Alpha", false),
      categoricalFilter("beta", "Beta", true),
    ]);
    qf.onExpandedChange = (value) => expandedChanges.push(value);
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );

    // Nothing expanded -> the toggle offers Expand all with every column.
    fireEvent.click(screen.getByRole("button", { name: "Expand all filters" }));
    expect(expandedChanges.at(-1)).toEqual(["beta", "alpha"]);
  });

  it("shows only active facets plus an Add filter picker when active-only mode is on", () => {
    // The header … menu persists the mode per table; no provider here, so
    // the storage key is the unscoped default.
    localStorage.setItem("data-table-controls-active-only", "true");
    try {
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

      expect(screen.getByText("Beta")).toBeInTheDocument();
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Add filter/ }),
      ).toBeInTheDocument();
    } finally {
      localStorage.removeItem("data-table-controls-active-only");
    }
  });

  it("tracks late-arriving URL filters (Pages Router populates params after mount)", () => {
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

describe("DataTableControls blocked facets (LFE-11040)", () => {
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

  const queryFilter = (
    filters: UIFilter[],
    expanded: string[] = [],
  ): QueryFilter => ({
    filters,
    expanded,
    onExpandedChange: () => {},
    clearAll: () => {},
    isFiltered: filters.some((f) => f.isActive),
    setFilterState: () => {},
  });

  const REASON = "Charts can't filter by this field at the moment.";

  it("blocks an INACTIVE facet whose column the surface can't honour, while leaving a forwardable one live", () => {
    // The core of LFE-11040: previously only an ACTIVE filter deactivated, so
    // an empty facet on an unavailable column stayed usable. Now a column the
    // surface can't honour blocks regardless of whether it holds a value.
    const { container } = render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={queryFilter(
            [
              categoricalFilter("blocked", "Blocked", false),
              categoricalFilter("forwardable", "Forwardable", false),
            ],
            // Expand both so each facet's fieldset is mounted and observable.
            ["blocked", "forwardable"],
          )}
          blockedColumnReason={(column) =>
            column === "blocked" ? REASON : null
          }
        />
      </TooltipProvider>,
    );

    // The inactive-but-blocked facet's inputs are disabled (fieldset) even
    // though it carries no value…
    expect(
      container.querySelector('[data-facet-column="blocked"] fieldset'),
    ).toBeDisabled();
    // …and its header reads blocked (dimmed + not-allowed cursor).
    expect(screen.getByRole("button", { name: /Blocked/ }).className).toContain(
      "cursor-not-allowed",
    );

    // A forwardable inactive facet (resolver returns null) stays interactive.
    expect(
      container.querySelector('[data-facet-column="forwardable"] fieldset'),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Forwardable/ }).className,
    ).not.toContain("cursor-not-allowed");
  });

  it("makes a blocked column non-addable in the Add-filter picker, carrying the reason as its title", () => {
    // Active-only mode surfaces the rest of the catalog behind "Add filter".
    localStorage.setItem("data-table-controls-active-only", "true");
    try {
      render(
        <TooltipProvider>
          <DataTableControls
            queryFilter={queryFilter([
              // One active facet so active-only mode has something to show
              // and the picker (addable = the inactive rest) renders.
              categoricalFilter("active", "Active", true),
              categoricalFilter("blocked", "Blocked", false),
              categoricalFilter("forwardable", "Forwardable", false),
            ])}
            blockedColumnReason={(column) =>
              column === "blocked" ? REASON : null
            }
          />
        </TooltipProvider>,
      );

      // Open the Add-filter dropdown. Radix opens the menu on the trigger's
      // pointer-down, which jsdom doesn't synthesize reliably; the keyboard
      // path (Enter) opens it without depending on PointerEvent support.
      const addButton = screen.getByRole("button", { name: /Add filter/ });
      fireEvent.keyDown(addButton, { key: "Enter" });

      const blockedItem = screen.getByRole("menuitem", { name: "Blocked" });
      const forwardableItem = screen.getByRole("menuitem", {
        name: "Forwardable",
      });
      // Blocked column stays visible but is disabled, with the reason on hover.
      expect(blockedItem).toHaveAttribute("aria-disabled", "true");
      expect(blockedItem).toHaveAttribute("title", REASON);
      // Forwardable column is addable as usual.
      expect(forwardableItem).not.toHaveAttribute("aria-disabled", "true");
      expect(forwardableItem).not.toHaveAttribute("title");
    } finally {
      localStorage.removeItem("data-table-controls-active-only");
    }
  });
});
