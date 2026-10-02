/**
 * Gesture-level tests for arrayOptions exclusion semantics (LFE-10717).
 *
 * The sidebar facet renders "no filter" as every option checked. Unchecking a
 * value from that implicit-all state means "exclude this value", which for a
 * multi-valued column (a session can have several userIds, a trace several
 * tags) is only expressible as `none of [value]` — NOT `any of [all others]`,
 * which both returns wrong results (rows carrying the excluded value alongside
 * another one still match) and materializes O(option-count) state into the URL
 * (HTTP 431 at ~1000 user IDs).
 *
 * Display follows the unified checked=kept model: a `none of [x]` filter
 * renders as everything-but-x checked with the NONE operator active, exactly
 * like stringOptions none-of filters always have.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  useSidebarFilterState,
  type CategoricalUIFilter,
} from "./hooks/useSidebarFilterState";
import type { FilterConfig } from "./lib/filter-config";

// The hook calls useQueryParam unconditionally even for the "memory" state
// location used here; stub it out so no QueryParamProvider is needed.
vi.mock("use-query-params", async () => {
  const actual = await vi.importActual("use-query-params");
  return {
    ...actual,
    StringParam: {},
    useQueryParam: () => [null, () => {}] as const,
  };
});

const TAGS_FILTER_CONFIG: FilterConfig = {
  tableName: "traces",
  columnDefinitions: [
    {
      id: "tags",
      name: "Tags",
      type: "arrayOptions",
      options: [],
      internal: 't."tags"',
    },
  ],
  facets: [
    {
      type: "categorical",
      column: "tags",
      label: "Tags",
    },
  ],
};

const TAG_OPTIONS = {
  tags: ["tag-1", "tag-2", "tag-3", "tag-4"],
};

function ExclusionHarness() {
  const queryFilter = useSidebarFilterState(TAGS_FILTER_CONFIG, TAG_OPTIONS, {
    stateLocation: "memory",
  });

  const facet = queryFilter.filters.find(
    (f): f is CategoricalUIFilter => f.column === "tags",
  );
  if (!facet) throw new Error("tags facet missing");

  // Mirrors the checkbox handler in data-table-controls.tsx: checking adds the
  // option to the current value list, unchecking removes it.
  const toggle = (option: string) => {
    const next = facet.value.includes(option)
      ? facet.value.filter((v) => v !== option)
      : [...facet.value, option];
    facet.onChange(next);
  };

  return (
    <div>
      <pre data-testid="filter-state">
        {JSON.stringify(queryFilter.filterState)}
      </pre>
      <pre data-testid="facet-value">{JSON.stringify(facet.value)}</pre>
      <pre data-testid="facet-operator">{facet.operator ?? "undefined"}</pre>
      <pre data-testid="facet-active">{String(facet.isActive)}</pre>
      {TAG_OPTIONS.tags.map((option) => (
        <button
          key={option}
          data-testid={`toggle-${option}`}
          onClick={() => toggle(option)}
        >
          toggle {option}
        </button>
      ))}
      <button
        data-testid="only-tag-3"
        onClick={() => facet.onOnlyChange?.("tag-3")}
      >
        only tag-3
      </button>
      <button
        data-testid="only-tag-4"
        onClick={() => facet.onOnlyChange?.("tag-4")}
      >
        only tag-4
      </button>
      <button
        data-testid="operator-any-of"
        onClick={() => facet.onOperatorChange?.("any of")}
      >
        SOME
      </button>
      <button
        data-testid="operator-none-of"
        onClick={() => facet.onOperatorChange?.("none of")}
      >
        NONE
      </button>
      <button
        data-testid="set-stale-exclusion"
        onClick={() =>
          queryFilter.setFilterState([
            {
              column: "tags",
              type: "arrayOptions",
              operator: "none of",
              value: ["stale-tag"],
            },
          ])
        }
      >
        set stale exclusion
      </button>
    </div>
  );
}

const NAME_FILTER_CONFIG: FilterConfig = {
  tableName: "traces",
  columnDefinitions: [
    {
      id: "name",
      name: "Name",
      type: "stringOptions",
      options: [],
      internal: 't."name"',
    },
  ],
  facets: [
    {
      type: "categorical",
      column: "name",
      label: "Name",
    },
  ],
};

const NAME_OPTIONS = {
  name: ["checkout", "search", "chat"],
};

// stringOptions facets share the display pipeline: the operator must be
// exposed there too so the none-of pinning in data-table-controls can surface
// the just-unchecked row (the SOME/ALL/NONE toggle stays arrayOptions-only via
// onOperatorChange).
function StringOptionsHarness() {
  const queryFilter = useSidebarFilterState(NAME_FILTER_CONFIG, NAME_OPTIONS, {
    stateLocation: "memory",
  });

  const facet = queryFilter.filters.find(
    (f): f is CategoricalUIFilter => f.column === "name",
  );
  if (!facet) throw new Error("name facet missing");

  return (
    <div>
      <pre data-testid="filter-state">
        {JSON.stringify(queryFilter.filterState)}
      </pre>
      <pre data-testid="facet-operator">{facet.operator ?? "undefined"}</pre>
      <pre data-testid="facet-has-toggle">
        {String(facet.onOperatorChange !== undefined)}
      </pre>
      <button
        data-testid="uncheck-search"
        onClick={() =>
          facet.onChange(facet.value.filter((v) => v !== "search"))
        }
      >
        uncheck search
      </button>
      <button
        data-testid="check-search"
        onClick={() => facet.onChange([...facet.value, "search"])}
      >
        check search
      </button>
      <button
        data-testid="set-stale-name-exclusion"
        onClick={() =>
          queryFilter.setFilterState([
            {
              column: "name",
              type: "stringOptions",
              operator: "none of",
              value: ["stale-name"],
            },
          ])
        }
      >
        set stale name exclusion
      </button>
    </div>
  );
}

const getFilterState = () =>
  JSON.parse(screen.getByTestId("filter-state").textContent ?? "[]");
const getFacetValue = () =>
  JSON.parse(screen.getByTestId("facet-value").textContent ?? "[]");
const getFacetOperator = () => screen.getByTestId("facet-operator").textContent;
const getFacetActive = () =>
  screen.getByTestId("facet-active").textContent === "true";

describe("arrayOptions facet exclusion gestures (LFE-10717)", () => {
  it("unchecking one value from implicit-all produces a compact none-of filter and inverted display", () => {
    render(<ExclusionHarness />);

    // Implicit-all default: everything checked, no persisted filter.
    expect(getFacetValue()).toEqual(TAG_OPTIONS.tags);
    expect(getFilterState()).toEqual([]);

    fireEvent.click(screen.getByTestId("toggle-tag-2"));

    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["tag-2"],
      },
    ]);
    // Display round-trips: the unchecked value stays unchecked, the rest stay
    // checked, and the NONE operator is active.
    expect(getFacetValue()).toEqual(["tag-1", "tag-3", "tag-4"]);
    expect(getFacetOperator()).toBe("none of");
    expect(getFacetActive()).toBe(true);
  });

  it("accumulates exclusions, drops re-checked ones, and clears the filter when the last exclusion is re-checked", () => {
    render(<ExclusionHarness />);

    fireEvent.click(screen.getByTestId("toggle-tag-2"));
    fireEvent.click(screen.getByTestId("toggle-tag-3"));
    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["tag-2", "tag-3"],
      },
    ]);

    // Re-check tag-2: only tag-3 stays excluded.
    fireEvent.click(screen.getByTestId("toggle-tag-2"));
    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["tag-3"],
      },
    ]);

    // Re-check the last exclusion: back to the implicit-all default, no
    // lingering empty none-of filter.
    fireEvent.click(screen.getByTestId("toggle-tag-3"));
    expect(getFilterState()).toEqual([]);
    expect(getFacetValue()).toEqual(TAG_OPTIONS.tags);
    expect(getFacetActive()).toBe(false);
  });

  it('label-click "Only" during an active exclusion selects exactly that value (any of)', () => {
    render(<ExclusionHarness />);

    fireEvent.click(screen.getByTestId("toggle-tag-2"));
    fireEvent.click(screen.getByTestId("only-tag-3"));

    // "Only" always means only: the exclusion is dropped in favor of a
    // positive single-value selection, not `none of [tag-3]` (which would be
    // the opposite of "only").
    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["tag-3"],
      },
    ]);
    expect(getFacetValue()).toEqual(["tag-3"]);
    expect(getFacetOperator()).toBe("any of");
  });

  it("SOME↔NONE operator toggle carries the value list (semantic inversion)", () => {
    render(<ExclusionHarness />);

    fireEvent.click(screen.getByTestId("toggle-tag-2"));
    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["tag-2"],
      },
    ]);

    // NONE → SOME: "exclude tag-2" becomes "match tag-2".
    fireEvent.click(screen.getByTestId("operator-any-of"));
    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["tag-2"],
      },
    ]);
    expect(getFacetValue()).toEqual(["tag-2"]);

    // SOME → NONE: and back.
    fireEvent.click(screen.getByTestId("operator-none-of"));
    expect(getFilterState()).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["tag-2"],
      },
    ]);
    expect(getFacetValue()).toEqual(["tag-1", "tag-3", "tag-4"]);
  });

  it('label-click "All" on the last kept value resets the facet instead of excluding everything', () => {
    // With only one value left checked the label affordance reads "All"
    // (re-select everything). Under an active none-of filter this must clear
    // the filter — deriving exclusions from an empty checked set would yield
    // `none of [every option]`, the exact opposite of the label.
    render(<ExclusionHarness />);

    fireEvent.click(screen.getByTestId("toggle-tag-1"));
    fireEvent.click(screen.getByTestId("toggle-tag-2"));
    fireEvent.click(screen.getByTestId("toggle-tag-3"));
    expect(getFacetValue()).toEqual(["tag-4"]);

    // onOnlyChange on the single remaining checked value = the "All" branch.
    fireEvent.click(screen.getByTestId("only-tag-4"));

    expect(getFilterState()).toEqual([]);
    expect(getFacetValue()).toEqual(TAG_OPTIONS.tags);
    expect(getFacetActive()).toBe(false);
  });

  it("toggling NONE without any selection is a no-op (no vacuous none-of filter persisted)", () => {
    render(<ExclusionHarness />);

    fireEvent.click(screen.getByTestId("operator-none-of"));

    expect(getFilterState()).toEqual([]);
    expect(getFacetValue()).toEqual(TAG_OPTIONS.tags);
    expect(getFacetActive()).toBe(false);
  });

  it("keeps the facet active for an exclusion outside the current option list", () => {
    // The excluded value fell out of the (top-N-capped / time-scoped) option
    // list: every visible checkbox is checked, but the filter is still live —
    // the facet must surface that (Clear affordance) instead of looking idle.
    render(<ExclusionHarness />);

    fireEvent.click(screen.getByTestId("set-stale-exclusion"));

    expect(getFacetValue()).toEqual(TAG_OPTIONS.tags);
    expect(getFacetOperator()).toBe("none of");
    expect(getFacetActive()).toBe(true);
  });
});

describe("stringOptions facet operator plumbing (LFE-10717)", () => {
  it("exposes the none-of operator (for exclusion pinning) without an operator toggle", () => {
    render(<StringOptionsHarness />);

    fireEvent.click(screen.getByTestId("uncheck-search"));

    expect(getFilterState()).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "none of",
        value: ["search"],
      },
    ]);
    expect(screen.getByTestId("facet-operator").textContent).toBe("none of");
    expect(screen.getByTestId("facet-has-toggle").textContent).toBe("false");
  });

  it("carries an out-of-list exclusion across checkbox interactions (parity with arrayOptions)", () => {
    render(<StringOptionsHarness />);

    fireEvent.click(screen.getByTestId("set-stale-name-exclusion"));
    // Every visible box is checked (the stale value is not listed); unchecking
    // another value must extend the exclusion set, not silently drop the
    // stale one.
    fireEvent.click(screen.getByTestId("uncheck-search"));

    expect(getFilterState()).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "none of",
        value: ["stale-name", "search"],
      },
    ]);

    // Re-checking search keeps only the stale exclusion alive.
    fireEvent.click(screen.getByTestId("check-search"));
    expect(getFilterState()).toEqual([
      {
        column: "name",
        type: "stringOptions",
        operator: "none of",
        value: ["stale-name"],
      },
    ]);
  });

  it("re-checking the last excluded value still clears a stringOptions none-of filter", () => {
    render(<StringOptionsHarness />);

    fireEvent.click(screen.getByTestId("uncheck-search"));
    fireEvent.click(screen.getByTestId("check-search"));

    expect(getFilterState()).toEqual([]);
  });
});
