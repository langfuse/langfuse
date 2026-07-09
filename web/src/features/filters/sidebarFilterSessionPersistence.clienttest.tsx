import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import { useSidebarFilterState } from "./hooks/useSidebarFilterState";
import type { FilterConfig } from "./lib/filter-config";
import { encodeFiltersGeneric } from "./lib/filter-query-encoding";
import { buildSidebarFilterQueryStorageKey } from "./lib/persistedSidebarFilterQuery";

const queryParamStore = new Map<string, unknown>();
// Values placed here are NOT visible on the first render; they are applied on
// mount via the query-param setter, reproducing the Next.js Pages Router race
// where `router.query` is empty on the first render and only populated on a
// later (hydration) render. See the deep-link expansion tests below.
const deferredQueryParams = new Map<string, unknown>();

vi.mock("use-query-params", async () => {
  const React = require("react");
  const actual = await vi.importActual("use-query-params");

  return {
    ...actual,
    StringParam: {},
    useQueryParam: (key: string) => {
      const initialValue = queryParamStore.has(key)
        ? queryParamStore.get(key)
        : null;
      const [value, setValue] = React.useState(initialValue);

      const setQueryValue = React.useCallback(
        (
          next: unknown | ((previous: unknown) => unknown) | null | undefined,
        ) => {
          queueMicrotask(() => {
            setValue((previous: unknown) => {
              const resolved =
                typeof next === "function" ? next(previous) : (next ?? null);

              if (resolved === null || resolved === "") {
                queryParamStore.delete(key);
                return null;
              }

              queryParamStore.set(key, resolved);
              return resolved;
            });
          });
        },
        [key],
      );

      React.useEffect(() => {
        if (value === null || value === "") {
          queryParamStore.delete(key);
          return;
        }

        queryParamStore.set(key, value);
      }, [key, value]);

      // Apply a deferred value once, on mount: this lands the param on a later
      // render than the first, simulating Pages Router query hydration.
      React.useEffect(() => {
        if (deferredQueryParams.has(key)) {
          const deferred = deferredQueryParams.get(key);
          deferredQueryParams.delete(key);
          setQueryValue(deferred);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return [value, setQueryValue] as const;
    },
  };
});

const TEST_FILTER_CONFIG: FilterConfig = {
  tableName: "traces",
  columnDefinitions: [
    {
      id: "name",
      name: "Name",
      type: "stringOptions",
      options: [],
      internal: "name",
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

const TEST_OPTIONS = {
  name: ["checkout", "search"],
};

const FILTER_A: FilterState = [
  {
    column: "name",
    type: "stringOptions",
    operator: "any of",
    value: ["checkout"],
  },
];

const FILTER_B: FilterState = [
  {
    column: "name",
    type: "stringOptions",
    operator: "any of",
    value: ["search"],
  },
];

function SessionPersistenceHarness(props: { contextId?: string | null }) {
  const queryFilter = useSidebarFilterState(TEST_FILTER_CONFIG, TEST_OPTIONS, {
    stateLocation: "urlAndSessionStorage",
    sessionFilterContextId: props.contextId ?? null,
  });

  return (
    <div>
      <pre data-testid="explicit-state">
        {JSON.stringify(queryFilter.explicitFilterState)}
      </pre>
      <button
        data-testid="set-filter-b"
        onClick={() => queryFilter.setFilterState(FILTER_B)}
      >
        Set B
      </button>
      <button
        data-testid="clear-filters"
        onClick={() => queryFilter.setFilterState([])}
      >
        Clear
      </button>
    </div>
  );
}

// Reports the expanded state of the single "name" facet and lets a test
// collapse it. Used to assert the LFE-10164 deep-link expansion behavior.
function ExpansionHarness() {
  const queryFilter = useSidebarFilterState(TEST_FILTER_CONFIG, TEST_OPTIONS, {
    stateLocation: "urlAndSessionStorage",
  });

  const nameFacet = queryFilter.filters.find((f) => f.column === "name");

  return (
    <div>
      <pre data-testid="name-expanded">{String(nameFacet?.expanded)}</pre>
      <pre data-testid="expanded-list">
        {JSON.stringify(queryFilter.expanded)}
      </pre>
      <button
        data-testid="collapse-name"
        onClick={() =>
          queryFilter.onExpandedChange(
            queryFilter.expanded.filter((c) => c !== "name"),
          )
        }
      >
        Collapse name
      </button>
    </div>
  );
}

describe("useSidebarFilterState deep-link expansion (LFE-10164)", () => {
  const encodedFilterA = encodeFiltersGeneric(FILTER_A);
  const EXPANDED_STORAGE_KEY = `${TEST_FILTER_CONFIG.tableName}-filters-expanded`;
  const SEEDED_STORAGE_KEY = `${TEST_FILTER_CONFIG.tableName}-filters-seeded`;

  beforeEach(() => {
    sessionStorage.clear();
    queryParamStore.clear();
    deferredQueryParams.clear();
  });

  const getNameExpanded = () =>
    screen.getByTestId("name-expanded").textContent === "true";

  it("expands a facet section whose filter arrives on the first render", async () => {
    queryParamStore.set("filter", encodedFilterA);

    render(<ExpansionHarness />);

    await waitFor(() => {
      expect(getNameExpanded()).toBe(true);
    });
    expect(
      JSON.parse(sessionStorage.getItem(SEEDED_STORAGE_KEY) ?? '""'),
    ).toContain("name");
  });

  it("expands a facet section whose URL filter only arrives on a later render (Pages Router race)", async () => {
    // Empty on first render; the filter param lands on a later render. The old
    // one-shot mount effect seeded against the empty first render and never
    // re-ran, leaving the section collapsed. The during-render reconciliation
    // must expand it once the filter actually arrives.
    deferredQueryParams.set("filter", encodedFilterA);

    render(<ExpansionHarness />);

    // Section starts collapsed (no filter on first render).
    expect(getNameExpanded()).toBe(false);

    // Once the deferred filter arrives, the section expands.
    await waitFor(() => {
      expect(getNameExpanded()).toBe(true);
    });
  });

  it("does not re-expand a section the user collapsed, even though the URL filter is still active", async () => {
    // Filter already active and already auto-expanded once in this session.
    queryParamStore.set("filter", encodedFilterA);
    sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(""));
    sessionStorage.setItem(SEEDED_STORAGE_KEY, JSON.stringify("name"));

    render(<ExpansionHarness />);

    // The seeded marker records that "name" was already reconciled, so the
    // collapsed state is preserved instead of being re-expanded.
    await waitFor(() => {
      expect(screen.getByTestId("expanded-list").textContent).toBe("[]");
    });
    expect(getNameExpanded()).toBe(false);
  });

  it("keeps a manual collapse after it is reconciled within the same mount", async () => {
    queryParamStore.set("filter", encodedFilterA);

    render(<ExpansionHarness />);

    // Auto-expanded on arrival.
    await waitFor(() => {
      expect(getNameExpanded()).toBe(true);
    });

    // User collapses it.
    fireEvent.click(screen.getByTestId("collapse-name"));

    // It stays collapsed; the still-active filter does not re-expand it.
    await waitFor(() => {
      expect(getNameExpanded()).toBe(false);
    });
    // Give any stray re-render a chance to (incorrectly) re-seed.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getNameExpanded()).toBe(false);
  });
});

describe("useSidebarFilterState session persistence", () => {
  const encodedFilterA = encodeFiltersGeneric(FILTER_A);
  const encodedFilterB = encodeFiltersGeneric(FILTER_B);
  const buildSessionKey = (contextId: string | null = null) =>
    buildSidebarFilterQueryStorageKey({
      tableName: TEST_FILTER_CONFIG.tableName,
      contextId,
    });
  const encodeStoredState = (query: string, contextId: string | null = null) =>
    JSON.stringify({ contextId, query });

  beforeEach(() => {
    sessionStorage.clear();
    queryParamStore.clear();
  });

  const getExplicitState = () =>
    JSON.parse(screen.getByTestId("explicit-state").textContent ?? "[]");

  it.each([
    {
      name: "falls back to session filter state when URL filter is missing",
      setup: () => {
        sessionStorage.setItem(
          buildSessionKey(),
          encodeStoredState(encodedFilterA),
        );
      },
      expectedState: FILTER_A,
      expectedSessionQuery: encodedFilterA,
      expectUrlFilter: false,
    },
    {
      name: "prefers URL filter over session and mirrors URL filter into session",
      setup: () => {
        sessionStorage.setItem(
          buildSessionKey(),
          encodeStoredState(encodedFilterA),
        );
        queryParamStore.set("filter", encodedFilterB);
      },
      expectedState: FILTER_B,
      expectedSessionQuery: encodedFilterB,
      expectUrlFilter: true,
    },
  ])(
    "$name",
    async ({ setup, expectedState, expectedSessionQuery, expectUrlFilter }) => {
      const sessionKey = buildSessionKey();
      setup();

      render(<SessionPersistenceHarness />);

      await waitFor(() => {
        expect(getExplicitState()).toEqual(expectedState);
      });

      await waitFor(() => {
        expect(sessionStorage.getItem(sessionKey)).toBe(
          encodeStoredState(expectedSessionQuery),
        );
      });

      expect(queryParamStore.has("filter")).toBe(expectUrlFilter);
    },
  );

  it("writes URL and session on update and clears both on reset", async () => {
    const sessionKey = buildSessionKey();

    render(<SessionPersistenceHarness />);

    fireEvent.click(screen.getByTestId("set-filter-b"));

    await waitFor(() => {
      expect(queryParamStore.get("filter")).toBe(encodedFilterB);
    });
    expect(sessionStorage.getItem(sessionKey)).toBe(
      encodeStoredState(encodedFilterB),
    );

    fireEvent.click(screen.getByTestId("clear-filters"));

    await waitFor(() => {
      expect(queryParamStore.has("filter")).toBe(false);
    });
    expect(sessionStorage.getItem(sessionKey)).toBe(encodeStoredState(""));
  });

  it("resets persisted query when session context changes", async () => {
    const oldSessionKey = buildSessionKey("old");
    const newSessionKey = buildSessionKey("new");

    sessionStorage.setItem(
      oldSessionKey,
      encodeStoredState(encodedFilterA, "old"),
    );

    render(<SessionPersistenceHarness contextId="new" />);

    await waitFor(() => {
      expect(getExplicitState()).toEqual([]);
    });

    expect(sessionStorage.getItem(newSessionKey)).toBe(
      encodeStoredState("", "new"),
    );
  });

  it("clears filter state immediately and eventually clears URL/session", async () => {
    const sessionKey = buildSessionKey();
    queryParamStore.set("filter", encodedFilterB);

    render(<SessionPersistenceHarness />);

    await waitFor(() => {
      expect(getExplicitState()).toEqual(FILTER_B);
    });

    fireEvent.click(screen.getByTestId("clear-filters"));

    // Regression contract: UI state clears in the same interaction.
    expect(getExplicitState()).toEqual([]);

    await waitFor(
      () => {
        expect(queryParamStore.has("filter")).toBe(false);
      },
      { timeout: 300 },
    );

    await waitFor(() => {
      expect(sessionStorage.getItem(sessionKey)).toBe(encodeStoredState(""));
    });
  });
});
