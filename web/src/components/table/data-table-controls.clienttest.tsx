import { fireEvent, render, screen } from "@testing-library/react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
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

// Radix ScrollArea (wrapping the facet list) needs ResizeObserver, and the
// Add-filter picker's command list scrolls its active item into view — neither
// of which jsdom implements.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

describe("CategoricalFacet", () => {
  it("uses a custom option hover title", () => {
    render(
      <AccordionPrimitive.Root type="multiple" value={["evaluatorId"]}>
        <CategoricalFacet
          label="Evaluator"
          filterKey="evaluatorId"
          expanded
          loading={false}
          options={["evaluator-1"]}
          displayByValue={new Map([["evaluator-1", "Answer quality"]])}
          counts={new Map()}
          value={[]}
          onChange={() => {}}
          getOptionTitle={(value, label) => `${label} (${value})`}
          isActive={false}
          isDisabled={false}
          onReset={() => {}}
        />
      </AccordionPrimitive.Root>,
      { wrapper: TooltipProvider },
    );

    expect(screen.getByText("Answer quality")).toHaveAttribute(
      "title",
      "Answer quality (evaluator-1)",
    );
  });

  it("renders an option suffix after its label", () => {
    render(
      <AccordionPrimitive.Root type="multiple" value={["model"]}>
        <CategoricalFacet
          label="Model"
          filterKey="model"
          expanded
          loading={false}
          options={["gpt-4.1", "claude-sonnet"]}
          counts={new Map()}
          value={[]}
          onChange={() => {}}
          renderOptionSuffix={(value) =>
            value === "gpt-4.1" ? <span>Project default</span> : null
          }
          isActive={false}
          isDisabled={false}
          onReset={() => {}}
        />
      </AccordionPrimitive.Root>,
      { wrapper: TooltipProvider },
    );

    const label = screen.getByText("gpt-4.1");
    const suffix = screen.getByText("Project default");
    expect(
      label.compareDocumentPosition(suffix) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(label).not.toHaveClass("flex-1");
    expect(screen.getByText("claude-sonnet")).toBeInTheDocument();
  });

  it("shows selected values even when the backend returns no options", () => {
    render(
      <AccordionPrimitive.Root type="multiple" value={["type"]}>
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
      </AccordionPrimitive.Root>,
      // The active-facet clear affordance renders a Tooltip, which needs the
      // provider the app supplies globally.
      { wrapper: TooltipProvider },
    );

    expect(screen.getByText("AGENT")).toBeInTheDocument();
    expect(screen.queryByText("No options found")).not.toBeInTheDocument();
  });

  it("shows Clear for active selected values even when the backend returns no options", () => {
    render(
      <AccordionPrimitive.Root type="multiple" value={["type"]}>
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
      </AccordionPrimitive.Root>,
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
      <AccordionPrimitive.Root type="multiple" value={["c"]}>
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
      </AccordionPrimitive.Root>,
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
      <AccordionPrimitive.Root type="multiple" value={["c"]}>
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
      </AccordionPrimitive.Root>,
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
      <AccordionPrimitive.Root type="multiple" value={["c"]}>
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
      </AccordionPrimitive.Root>,
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
      <AccordionPrimitive.Root type="multiple" value={["c"]}>
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
      </AccordionPrimitive.Root>,
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
      <AccordionPrimitive.Root type="multiple" value={["c"]}>
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
      </AccordionPrimitive.Root>,
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
      <AccordionPrimitive.Root type="multiple" value={["tags"]}>
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
      </AccordionPrimitive.Root>,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByRole("tab", { name: "None of" })).toBeDisabled();

    // With a persisted selection the operator conversion is meaningful.
    render(
      <AccordionPrimitive.Root type="multiple" value={["tags2"]}>
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
      </AccordionPrimitive.Root>,
      { wrapper: TooltipProvider },
    );
    const tabs = screen.getAllByRole("tab", { name: "None of" });
    expect(tabs[tabs.length - 1]).toBeEnabled();
  });

  it("does not reorder short, fully-visible lists", () => {
    render(
      <AccordionPrimitive.Root type="multiple" value={["c"]}>
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
      </AccordionPrimitive.Root>,
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

  it("keeps the order while the user works the list, and re-settles on an external change (LFE-14843)", () => {
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

    // Clicking inside the facet list marks what follows as the user's own
    // edit: Alpha activating must not teleport out from under the cursor.
    fireEvent.pointerDown(screen.getByText("Alpha"));
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

    // A change from outside the sidebar (search bar, saved view, Clear all,
    // AI apply) carries no facet interaction, so the order settles.
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

  it("restores catalog order on Clear all, even with an in-list interaction outstanding", () => {
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

    // An in-list interaction that changes no promotion leaves its attribution
    // outstanding — Clear all must not inherit it and keep Beta pinned.
    fireEvent.pointerDown(screen.getByText("Beta"));
    // Radix opens the menu on pointer-down, which jsdom doesn't synthesize
    // reliably; the keyboard path opens it without PointerEvent support.
    fireEvent.keyDown(screen.getByRole("button", { name: "Filter options" }), {
      key: "Enter",
    });
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Clear all filters" }),
    );

    rerender(
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
  });

  it("re-sorts immediately when a facet's activity changes externally", () => {
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
    qf.isV4 = true;
    captureSpy.mockClear();
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );

    // Nothing expanded -> the toggle offers Expand all with every column.
    fireEvent.click(screen.getByRole("button", { name: "Expand all filters" }));
    expect(expandedChanges.at(-1)).toEqual(["beta", "alpha"]);

    const expandAll = captureSpy.mock.calls.filter(
      ([event]) => event === "filters:expand_all_toggled",
    );
    expect(expandAll).toHaveLength(1);
    expect(expandAll[0][1]).toMatchObject({
      expanded: true,
      facetCount: 2,
      layout: "panel",
      isV4: true,
    });
    // Expand-all is its own intent; it must not also emit per-facet toggles.
    expect(
      captureSpy.mock.calls.filter(
        ([event]) => event === "filters:facet_toggled",
      ),
    ).toHaveLength(0);
    for (const [, payload] of captureSpy.mock.calls) {
      expect(JSON.stringify(payload ?? {})).not.toContain('"x"');
    }
  });

  it("captures expand_all_toggled collapsed when every visible facet is open", () => {
    const qf = queryFilter([
      categoricalFilter("alpha", "Alpha", false),
      categoricalFilter("beta", "Beta", true),
    ]);
    qf.expanded = ["alpha", "beta"];
    qf.isV4 = false;
    captureSpy.mockClear();
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse all filters" }),
    );
    const expandAll = captureSpy.mock.calls.filter(
      ([event]) => event === "filters:expand_all_toggled",
    );
    expect(expandAll).toHaveLength(1);
    expect(expandAll[0][1]).toMatchObject({
      expanded: false,
      facetCount: 2,
      layout: "panel",
      isV4: false,
    });
    expect(
      captureSpy.mock.calls.filter(
        ([event]) => event === "filters:facet_toggled",
      ),
    ).toHaveLength(0);
  });

  it("captures facet_toggled once when a single header is opened", () => {
    const qf = queryFilter([
      categoricalFilter("alpha", "Alpha", false),
      categoricalFilter("beta", "Beta", true),
    ]);
    qf.isV4 = true;
    captureSpy.mockClear();
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Alpha All" }));
    const toggled = captureSpy.mock.calls.filter(
      ([event]) => event === "filters:facet_toggled",
    );
    expect(toggled).toHaveLength(1);
    expect(toggled[0][1]).toMatchObject({
      column: "alpha",
      expanded: true,
      layout: "panel",
      isV4: true,
    });
    expect(
      captureSpy.mock.calls.filter(
        ([event]) => event === "filters:expand_all_toggled",
      ),
    ).toHaveLength(0);
    for (const [, payload] of captureSpy.mock.calls) {
      expect(JSON.stringify(payload ?? {})).not.toContain('"x"');
    }
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

      fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));

      const blockedItem = screen.getByRole("option", { name: "Blocked" });
      const forwardableItem = screen.getByRole("option", {
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

describe("DataTableControls facet catalog", () => {
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

  const CATALOG = [
    categoricalFilter("environment", "Environment", false),
    categoricalFilter("release", "Release", false),
    categoricalFilter("name", "Name", false),
    categoricalFilter("version", "Version", false),
  ];

  it("keeps every facet visible so browser find can reach it", () => {
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={queryFilter(CATALOG)} />
      </TooltipProvider>,
    );

    expect(screen.getByText("Environment")).toBeVisible();
    expect(screen.getByText("Name")).toBeVisible();
    expect(screen.getByText("Release")).toBeVisible();
    expect(screen.getByText("Version")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Show \d+ more/ }),
    ).not.toBeInTheDocument();
  });

  it("expand-all expands every facet in the catalog", () => {
    const onExpandedChange = vi.fn();
    render(
      <TooltipProvider>
        <DataTableControls
          queryFilter={{
            ...queryFilter(CATALOG),
            onExpandedChange,
          }}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand all filters" }));
    expect(onExpandedChange).toHaveBeenCalledWith([
      "environment",
      "release",
      "name",
      "version",
    ]);
  });
});

describe("DataTableControls facet-name search", () => {
  // A catalog long enough to earn the search box (the traces sidebar's shape).
  const CATALOG: [column: string, label: string][] = [
    ["environment", "Environment"],
    ["name", "Trace Name"],
    ["id", "Trace ID"],
    ["userId", "User ID"],
    ["sessionId", "Session ID"],
    ["tags", "Tags"],
    ["metadata", "Metadata"],
    ["version", "Version"],
    ["release", "Release"],
    ["bookmarked", "Bookmarked"],
    ["level", "Status"],
    ["latency", "Latency"],
    ["totalTokens", "Total Tokens"],
  ];

  const catalog = (activeColumns: string[] = []): CategoricalUIFilter[] =>
    CATALOG.map(([column, label]) => ({
      type: "categorical",
      column,
      label,
      loading: false,
      expanded: false,
      isActive: activeColumns.includes(column),
      isDisabled: false,
      onReset: () => {},
      value: activeColumns.includes(column) ? ["x"] : [],
      options: ["x", "y"],
      counts: new Map(),
      onChange: () => {},
      // enables the Select/Text mode tabs, so a text-filter draft can be typed
      onTextFilterAdd: () => {},
      onTextFilterRemove: () => {},
    }));

  const queryFilter = (filters: UIFilter[]): QueryFilter => ({
    filters,
    expanded: [],
    onExpandedChange: () => {},
    clearAll: () => {},
    isFiltered: filters.some((f) => f.isActive),
    setFilterState: () => {},
  });

  const controls = (filters: UIFilter[]) => (
    <TooltipProvider>
      <DataTableControls queryFilter={queryFilter(filters)} />
    </TooltipProvider>
  );

  const searchFor = (query: string) =>
    fireEvent.change(screen.getByLabelText("Search filters"), {
      target: { value: query },
    });

  const labelOrder = (first: string, second: string) => {
    const a = screen.getByText(first);
    const b = screen.getByText(second);
    return Boolean(
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  };

  it("filters facet names immediately, and clearing restores the list with the selection intact", () => {
    render(controls(catalog(["userId"])));

    searchFor("token");
    expect(screen.getByText("Total Tokens")).toBeVisible();
    expect(screen.getByText("Environment")).not.toBeVisible();
    // The query hides a facet whose name misses it even while it is filtering.
    expect(screen.getByText("User ID")).not.toBeVisible();
    // The column key matches too: the label's space would defeat "userid".
    searchFor("userid");
    expect(screen.getByText("User ID")).toBeVisible();
    expect(screen.getByText("Trace Name")).not.toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear filter search" }),
    );
    expect(screen.getByText("Environment")).toBeVisible();
    // The selection was never touched — its header summary still reads it.
    expect(screen.getByText("x")).toBeInTheDocument();
  });

  it("reaches the no-match state with a filter active, without touching it", () => {
    // A query hides every facet it misses, so the dead end is reachable while a
    // filter is in force. Hiding is presentation ONLY: nothing here may reset,
    // clear or re-apply anything, or a keystroke in the search box would change
    // the rows on screen.
    const mutations: string[] = [];
    const filters = catalog(["userId"]).map((filter) => ({
      ...filter,
      onChange: () => mutations.push(`change:${filter.column}`),
      onReset: () => mutations.push(`reset:${filter.column}`),
    }));
    const qf: QueryFilter = {
      ...queryFilter(filters),
      clearAll: () => mutations.push("clearAll"),
      setFilterState: () => mutations.push("setFilterState"),
      onExpandedChange: () => mutations.push("expand"),
    };
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );

    searchFor("zzz");
    expect(screen.getByText("User ID")).not.toBeVisible();
    expect(screen.getByText("Environment")).not.toBeVisible();
    expect(screen.getByText('No filters match "zzz"')).toBeInTheDocument();
    expect(mutations).toEqual([]);

    fireEvent.click(
      screen.getByRole("button", { name: "Clear filter search" }),
    );
    // Back in full, selection intact — its header summary still reads it.
    expect(screen.getByText("User ID")).toBeVisible();
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(mutations).toEqual([]);
  });

  it("hides a non-matching facet rather than unmounting it, so an open draft survives", () => {
    // Facets hold uncommitted local state (a typed-but-not-added text filter, a
    // metadata condition mid-build, a debounced numeric draft). Dropping them
    // from the tree while someone types in the search box above would discard
    // that silently, so the search only hides them.
    const qf = queryFilter(catalog());
    qf.expanded = ["environment"];
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );
    // Radix Tabs commit on mouse-down; jsdom needs both events.
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Text" }));
    fireEvent.click(screen.getByRole("tab", { name: "Text" }));
    const draft = screen.getByPlaceholderText("Enter value...");
    fireEvent.change(draft, { target: { value: "half-typed" } });

    searchFor("token");
    expect(screen.getByText("Environment")).not.toBeVisible();
    // Same input node, same value: not remounted, not reset.
    expect(screen.getByPlaceholderText("Enter value...")).toBe(draft);
    expect(draft).toHaveValue("half-typed");

    fireEvent.click(
      screen.getByRole("button", { name: "Clear filter search" }),
    );
    expect(screen.getByText("Environment")).toBeVisible();
    expect(draft).toHaveValue("half-typed");
  });

  it("does not count typing in the search box as working the facet list", () => {
    // The list's keydown capture marks in-list edits so the order freezes
    // under the user's hands. Typing a query is not such an edit: an external
    // change while searching must still re-settle the order.
    const { rerender } = render(controls(catalog(["totalTokens"])));
    expect(labelOrder("Total Tokens", "Environment")).toBe(true);

    // "e" matches both compared facets, so only the order is under test.
    searchFor("e");
    expect(labelOrder("Total Tokens", "Environment")).toBe(true);

    rerender(controls(catalog(["environment", "totalTokens"])));
    expect(labelOrder("Environment", "Total Tokens")).toBe(true);
  });

  it("points the expand-all toggle at the facets the search leaves on screen", () => {
    const expandedChanges: string[][] = [];
    const qf = queryFilter(catalog());
    qf.expanded = ["environment"];
    qf.onExpandedChange = (value) => expandedChanges.push(value);
    render(
      <TooltipProvider>
        <DataTableControls queryFilter={qf} />
      </TooltipProvider>,
    );

    // Environment is expanded but a "token" query hides it, so the toggle must
    // offer to expand what IS on screen rather than to collapse the invisible.
    searchFor("token");
    fireEvent.click(screen.getByRole("button", { name: "Expand all filters" }));
    // The hidden facet keeps its expansion; the visible match joins it.
    expect(expandedChanges.at(-1)).toEqual(["environment", "totalTokens"]);
  });

  it("leaves a short sidebar without search chrome", () => {
    render(controls(catalog().slice(0, 3)));

    expect(screen.queryByLabelText("Search filters")).not.toBeInTheDocument();
  });

  it("searches the Add filter picker over the whole catalog", () => {
    localStorage.setItem("data-table-controls-active-only", "true");
    try {
      render(controls(catalog(["userId"])));

      // Active-only mode hands the catalog to the picker, so the list's own
      // search box steps aside.
      expect(screen.queryByLabelText("Search filters")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));

      const pickerSearch = screen.getByPlaceholderText("Search filters");
      fireEvent.change(pickerSearch, { target: { value: "token" } });
      expect(
        screen.getByRole("option", { name: "Total Tokens" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Environment" }),
      ).not.toBeInTheDocument();

      fireEvent.change(pickerSearch, { target: { value: "zzz" } });
      expect(screen.getByText(/No filters match "zzz"/)).toBeInTheDocument();
    } finally {
      localStorage.removeItem("data-table-controls-active-only");
    }
  });

  it("captures facet_search once per search session, without the query text", () => {
    captureSpy.mockClear();
    render(controls(catalog()));

    searchFor("tok");
    searchFor("token");
    const searchEvents = captureSpy.mock.calls.filter(
      ([event]) => event === "filters:facet_search",
    );
    expect(searchEvents).toHaveLength(1);
    expect(searchEvents[0][1]).toEqual({
      tableName: undefined,
      surface: "facet_list",
      isV4: false,
    });

    // Clearing ends the session, so the next search is a new one.
    searchFor("");
    searchFor("latency");
    expect(
      captureSpy.mock.calls.filter(
        ([event]) => event === "filters:facet_search",
      ),
    ).toHaveLength(2);
  });
});
