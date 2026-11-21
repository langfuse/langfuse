import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { useState, type ReactNode } from "react";
import {
  QueryParamProvider,
  type QueryParamAdapterComponent,
  type QueryParamAdapter,
} from "use-query-params";
import { useExperimentResultsState } from "./useExperimentResultsState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { experimentItemsFilterConfig } from "../config/experiment-items-filter-config";
import {
  buildSidebarFilterQueryStorageKey,
  createPersistedSidebarFilterQueryState,
} from "@/src/features/filters/lib/persistedSidebarFilterQuery";

const initialQueryParams = new Map<string, unknown>();
const largeTargetedFilters: FilterState = [
  {
    type: "categoryOptions",
    column: "score_categories",
    key: "verdict",
    operator: "any of",
    value: Array.from(
      { length: 401 },
      (_, index) => `unseen-verdict-${index}-abcdefghijklmnop`,
    ),
    target: "baseline",
  },
  {
    type: "stringOptions",
    column: "level",
    operator: "none of",
    value: ["ERROR"],
    target: "comp-a",
  },
];

function createQueryWrapper() {
  const params = new URLSearchParams();
  for (const [key, value] of initialQueryParams) {
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, String(item));
    }
  }
  let location: QueryParamAdapter["location"] = { search: `?${params}` };
  const Adapter: QueryParamAdapterComponent = ({ children }) => {
    const [currentLocation, setLocation] = useState(location);
    const navigate = (next: QueryParamAdapter["location"]) => {
      location = next;
      setLocation(next);
    };
    return children({
      location: currentLocation,
      replace: navigate,
      push: navigate,
    });
  };
  return {
    wrapper: function QueryWrapper({ children }: { children: ReactNode }) {
      return (
        <QueryParamProvider
          adapter={Adapter}
          options={{ enableBatching: true }}
        >
          {children}
        </QueryParamProvider>
      );
    },
    params: () => new URLSearchParams(location.search),
  };
}

const settleUrl = () => act(() => vi.runOnlyPendingTimers());

function renderHarness() {
  const query = createQueryWrapper();
  return { ...render(<Harness />, { wrapper: query.wrapper }), query };
}

function Harness() {
  const {
    baselineId,
    hasBaseline,
    comparisonIds,
    setComparisonIds,
    maxSelectedExperiments,
    clearBaseline,
    selectedExperimentIds,
    layout,
    diffMode,
  } = useExperimentResultsState("project-a");

  return (
    <div>
      <div data-testid="baseline">{baselineId ?? "null"}</div>
      <div data-testid="has-baseline">{hasBaseline ? "true" : "false"}</div>
      <div data-testid="comparisons">{comparisonIds.join(",")}</div>
      <div data-testid="selected">{selectedExperimentIds.join(",")}</div>
      <div data-testid="max-experiments">{maxSelectedExperiments}</div>
      <div data-testid="layout">{layout}</div>
      <div data-testid="diff-mode">{diffMode}</div>
      <button
        type="button"
        onClick={() =>
          setComparisonIds(
            Array.from({ length: 12 }, (_, index) => `comp-${index}`),
          )
        }
      >
        set twelve comparisons
      </button>
      <button type="button" onClick={clearBaseline}>
        clear
      </button>
    </div>
  );
}

describe("useExperimentResultsState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    initialQueryParams.clear();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    settleUrl();
    vi.useRealTimers();
  });

  it("defaults to one column per experiment with or without comparisons", () => {
    initialQueryParams.set("baseline", "baseline-run");

    renderHarness();

    expect(screen.getByTestId("layout").textContent).toBe("grid");
    expect(screen.getByTestId("diff-mode").textContent).toBe("comparison");

    initialQueryParams.set("c", ["comp-a"]);

    renderHarness();

    expect(screen.getAllByTestId("layout")[1].textContent).toBe("grid");
  });

  it("lets an explicit layout in the URL win over the default", () => {
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set("c", ["comp-a"]);
    initialQueryParams.set("layout", "list");

    renderHarness();

    expect(screen.getByTestId("layout").textContent).toBe("list");
  });

  it("ignores the old layout preference after the comparison layout reset", () => {
    localStorage.setItem("experiment-results-layout", JSON.stringify("list"));
    renderHarness();
    expect(screen.getByTestId("layout").textContent).toBe("grid");
  });

  it("preserves a remembered layout when the URL does not specify one", () => {
    localStorage.setItem(
      "experiment-results-compare-layout",
      JSON.stringify("list"),
    );
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set("c", ["comp-a"]);

    renderHarness();

    expect(screen.getByTestId("layout").textContent).toBe("list");
  });

  it("derives hasBaseline correctly", () => {
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set("c", ["comp-a"]);

    renderHarness();

    expect(screen.getByTestId("has-baseline").textContent).toBe("true");

    initialQueryParams.clear();
    initialQueryParams.set("c", ["comp-a"]);

    renderHarness();

    expect(screen.getAllByTestId("has-baseline")[1].textContent).toBe("false");
  });

  it("keeps c-only selections as comparisons without an implicit baseline", () => {
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set("c", ["comp-a", "comp-b"]);

    renderHarness();

    expect(screen.getByTestId("comparisons").textContent).toBe("comp-a,comp-b");

    initialQueryParams.clear();
    initialQueryParams.set("c", ["comp-a", "comp-b"]);

    renderHarness();

    expect(screen.getAllByTestId("has-baseline")[1].textContent).toBe("false");
    expect(screen.getAllByTestId("comparisons")[1].textContent).toBe(
      "comp-a,comp-b",
    );
    expect(screen.getAllByTestId("selected")[1].textContent).toBe(
      "comp-a,comp-b",
    );
  });

  it("clears baseline by URL state only and moves it into comparisons", () => {
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set("c", ["comp-a"]);

    const { query } = renderHarness();

    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    settleUrl();

    expect(screen.getByTestId("baseline").textContent).toBe("null");
    expect(screen.getByTestId("comparisons").textContent).toBe(
      "comp-a,baseline-run",
    );
    expect(screen.getByTestId("selected").textContent).toBe(
      "comp-a,baseline-run",
    );

    expect(query.params().has("baseline")).toBe(false);
    expect(query.params().getAll("c")).toEqual(["comp-a", "baseline-run"]);
  });

  it("allows up to ten selected experiments and clamps additional selections", () => {
    renderHarness();

    fireEvent.click(
      screen.getByRole("button", { name: "set twelve comparisons" }),
    );
    settleUrl();

    expect(screen.getByTestId("max-experiments").textContent).toBe("10");
    expect(screen.getByTestId("selected").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
    expect(screen.getByTestId("comparisons").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
  });

  it("clamps comparison IDs loaded from the URL", () => {
    initialQueryParams.set(
      "c",
      Array.from({ length: 12 }, (_, index) => `comp-${index}`),
    );

    renderHarness();

    expect(screen.getByTestId("selected").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
    expect(screen.getByTestId("comparisons").textContent).toBe(
      Array.from({ length: 10 }, (_, index) => `comp-${index}`).join(","),
    );
  });

  it("keeps an explicit baseline outside the ten comparison slots", () => {
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set(
      "c",
      Array.from({ length: 12 }, (_, index) => `comp-${index}`),
    );

    renderHarness();

    expect(screen.getByTestId("selected").textContent).toBe(
      [
        "baseline-run",
        ...Array.from({ length: 9 }, (_, index) => `comp-${index}`),
      ].join(","),
    );
    expect(screen.getByTestId("comparisons").textContent).toBe(
      Array.from({ length: 9 }, (_, index) => `comp-${index}`).join(","),
    );
  });

  it.each([
    [
      "add",
      (state: ReturnType<typeof useExperimentResultsState>) =>
        state.addComparisonId("comp-c"),
    ],
    [
      "remove",
      (state: ReturnType<typeof useExperimentResultsState>) =>
        state.removeComparisonId("comp-a"),
    ],
    [
      "rebaseline",
      (state: ReturnType<typeof useExperimentResultsState>) =>
        state.setBaseline("comp-a"),
    ],
    [
      "clear baseline",
      (state: ReturnType<typeof useExperimentResultsState>) =>
        state.clearBaseline(),
    ],
  ] as const)(
    "carries freshly committed oversized filters when runs %s",
    (_name, changeSelection) => {
      initialQueryParams.set("baseline", "baseline-run");
      initialQueryParams.set("c", ["comp-a", "comp-b"]);
      const filters = largeTargetedFilters;
      const destinationRenders: FilterState[] = [];
      const query = createQueryWrapper();
      const { result, unmount } = renderHook(
        () => {
          const selection = useExperimentResultsState("project-a");
          const sidebar = useSidebarFilterState(
            experimentItemsFilterConfig,
            {},
            {
              stateLocation: "urlAndSessionStorage",
              sessionFilterContextId: JSON.stringify([
                "project-a",
                selection.baselineId ?? null,
                selection.comparisonIds.slice().sort(),
              ]),
            },
          );
          if (
            selection.baselineId !== "baseline-run" ||
            selection.comparisonIds.join(",") !== "comp-a,comp-b"
          ) {
            destinationRenders.push(sidebar.explicitFilterState);
          }
          return { selection, sidebar };
        },
        { wrapper: query.wrapper },
      );

      act(() => {
        result.current.sidebar.setFilterState(filters);
        changeSelection(result.current.selection);
      });

      expect(result.current.sidebar.explicitFilterState).toEqual(filters);
      settleUrl();
      expect(query.params().has("filter")).toBe(false);
      expect(result.current.sidebar.explicitFilterState).toEqual(filters);
      expect(destinationRenders.length).toBeGreaterThan(0);
      expect(destinationRenders).toEqual(destinationRenders.map(() => filters));

      unmount();
      initialQueryParams.set("baseline", "unrelated-run");
      initialQueryParams.set("c", []);
      const fresh = renderHook(
        () =>
          useSidebarFilterState(
            experimentItemsFilterConfig,
            {},
            {
              stateLocation: "urlAndSessionStorage",
              sessionFilterContextId: JSON.stringify([
                "project-a",
                "unrelated-run",
                [],
              ]),
            },
          ),
        { wrapper: createQueryWrapper().wrapper },
      );
      expect(fresh.result.current.explicitFilterState).toEqual([]);
    },
  );

  it("carries a large replacement of a short URL filter through a batched selection change", () => {
    initialQueryParams.set("baseline", "baseline-run");
    initialQueryParams.set("c", ["comp-a", "comp-b"]);
    initialQueryParams.set(
      "filter",
      encodeFiltersGeneric([
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["WARNING"],
        },
      ]),
    );
    const destinationRenders: FilterState[] = [];
    const query = createQueryWrapper();
    const { result } = renderHook(
      () => {
        const selection = useExperimentResultsState("project-a");
        const sidebar = useSidebarFilterState(
          experimentItemsFilterConfig,
          {},
          {
            stateLocation: "urlAndSessionStorage",
            sessionFilterContextId: JSON.stringify([
              "project-a",
              selection.baselineId ?? null,
              selection.comparisonIds.slice().sort(),
            ]),
          },
        );
        if (selection.comparisonIds.length === 1)
          destinationRenders.push(sidebar.explicitFilterState);
        return { selection, sidebar };
      },
      { wrapper: query.wrapper },
    );

    act(() => {
      result.current.sidebar.setFilterState(largeTargetedFilters);
      result.current.selection.removeComparisonId("comp-a");
    });
    expect(result.current.sidebar.explicitFilterState).toEqual(
      largeTargetedFilters,
    );
    settleUrl();
    expect(query.params().has("filter")).toBe(false);

    expect(destinationRenders.length).toBeGreaterThan(0);
    expect(destinationRenders).toEqual(
      destinationRenders.map(() => largeTargetedFilters),
    );
    expect(result.current.sidebar.explicitFilterState).toEqual(
      largeTargetedFilters,
    );
  });

  it("carries explicit URL filters and replaces a destination's old filter with an empty selection", () => {
    const oldFilters: FilterState = [
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
        target: "comp-a",
      },
    ];
    const urlFilters: FilterState = [
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["WARNING"],
        target: "baseline",
      },
    ];
    const destinationContextId = JSON.stringify([
      "project-a",
      "baseline-run",
      ["comp-a"],
    ]);
    const destinationKey = buildSidebarFilterQueryStorageKey({
      tableName: "experiment-items",
      contextId: destinationContextId,
    });
    const seedDestination = () =>
      sessionStorage.setItem(
        destinationKey,
        JSON.stringify(
          createPersistedSidebarFilterQueryState(
            destinationContextId,
            encodeFiltersGeneric(oldFilters),
          ),
        ),
      );
    initialQueryParams.set("baseline", "baseline-run");
    seedDestination();
    const { result, unmount } = renderHook(
      () => useExperimentResultsState("project-a"),
      { wrapper: createQueryWrapper().wrapper },
    );

    act(() => result.current.addComparisonId("comp-a"));
    settleUrl();
    expect(JSON.parse(sessionStorage.getItem(destinationKey)!).query).toBe("");

    unmount();
    initialQueryParams.set("c", []);
    initialQueryParams.set("filter", encodeFiltersGeneric(urlFilters));
    seedDestination();
    const explicit = renderHook(() => useExperimentResultsState("project-a"), {
      wrapper: createQueryWrapper().wrapper,
    });
    act(() => explicit.result.current.addComparisonId("comp-a"));
    settleUrl();
    expect(JSON.parse(sessionStorage.getItem(destinationKey)!).query).toBe(
      encodeFiltersGeneric(urlFilters),
    );
    explicit.unmount();

    initialQueryParams.set("c", []);
    initialQueryParams.set("filter", "");
    const sourceContextId = JSON.stringify(["project-a", "baseline-run", []]);
    sessionStorage.setItem(
      buildSidebarFilterQueryStorageKey({
        tableName: "experiment-items",
        contextId: sourceContextId,
      }),
      JSON.stringify(
        createPersistedSidebarFilterQueryState(
          sourceContextId,
          encodeFiltersGeneric(oldFilters),
        ),
      ),
    );
    seedDestination();
    const empty = renderHook(() => useExperimentResultsState("project-a"), {
      wrapper: createQueryWrapper().wrapper,
    });
    act(() => empty.result.current.addComparisonId("comp-a"));
    settleUrl();
    expect(JSON.parse(sessionStorage.getItem(destinationKey)!).query).toBe("");
  });
});
