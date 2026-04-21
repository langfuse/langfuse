import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import { useSidebarFilterState } from "./hooks/useSidebarFilterState";
import type { FilterConfig } from "./lib/filter-config";
import { encodeFiltersGeneric } from "./lib/filter-query-encoding";
import { buildSidebarFilterQueryStorageKey } from "./lib/persistedSidebarFilterQuery";

const queryParamStore = new Map<string, unknown>();

jest.mock("use-query-params", () => {
  const React = require("react");
  const actual = jest.requireActual("use-query-params");

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
