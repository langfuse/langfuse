import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { TableViewPresetTableName, type FilterState } from "@langfuse/shared";
import { useState } from "react";
import { useSidebarFilterState } from "./hooks/useSidebarFilterState";
import { DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS } from "./constants/internal-environments";
import type { FilterConfig } from "./lib/filter-config";
import { useTableViewManager } from "../../components/table/table-view-presets/hooks/useTableViewManager";

const mockUseRouter = vi.fn();
const mockCapture = vi.fn();
const mockGetDefaultUseQuery = vi.fn();
const mockGetByIdUseQuery = vi.fn();

const queryParamStore = new Map<string, unknown>();

type MockViewQueryResult = {
  data?: unknown;
  error?: unknown;
  isSuccess?: boolean;
  isError?: boolean;
};

const hasDefaultValue = (value: unknown): value is { __default: unknown } =>
  typeof value === "object" && value !== null && "__default" in value;

const isMockViewQueryResult = (value: unknown): value is MockViewQueryResult =>
  typeof value === "object" && value !== null;

vi.mock("next/router", () => ({
  useRouter: () => mockUseRouter(),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({
    capture: mockCapture,
  }),
}));

vi.mock(
  "../../components/table/table-view-presets/components/data-table-view-presets-drawer",
  () => ({
    isSystemPresetId: () => false,
  }),
);

vi.mock("../../utils/api", () => ({
  api: {
    TableViewPresets: {
      getDefault: {
        useQuery: (...args: unknown[]) => mockGetDefaultUseQuery(...args),
      },
      getById: {
        useQuery: (...args: unknown[]) => {
          const result = mockGetByIdUseQuery(...args);
          const normalizedResult = isMockViewQueryResult(result)
            ? result
            : undefined;

          return {
            data: normalizedResult?.data,
            error: normalizedResult?.error ?? null,
            isSuccess:
              normalizedResult?.isSuccess ??
              normalizedResult?.data !== undefined,
            isError: normalizedResult?.isError ?? !!normalizedResult?.error,
          };
        },
      },
    },
  },
}));

vi.mock("use-query-params", async () => {
  const React = require("react");
  const actual = await vi.importActual("use-query-params");

  const StringParam = { __type: "string" } as const;
  const withDefault = (param: unknown, defaultValue: unknown) => ({
    ...(typeof param === "object" && param !== null ? param : {}),
    __default: defaultValue,
  });

  const readDefault = (config: unknown) =>
    hasDefaultValue(config) ? config.__default : null;

  return {
    ...actual,
    StringParam,
    withDefault,
    useQueryParam: (key: string, config?: unknown) => {
      const defaultValue = readDefault(config);
      const initialValue = queryParamStore.has(key)
        ? queryParamStore.get(key)
        : defaultValue;
      const [value, setValue] = React.useState(initialValue);

      const setQueryValue = React.useCallback(
        (
          next: unknown | ((previous: unknown) => unknown) | null | undefined,
        ) => {
          const previous = queryParamStore.has(key)
            ? queryParamStore.get(key)
            : defaultValue;
          const resolved = typeof next === "function" ? next(previous) : next;

          if (resolved === null || resolved === undefined || resolved === "") {
            queryParamStore.delete(key);
            setValue(defaultValue);
            return;
          }

          queryParamStore.set(key, resolved);
          setValue(resolved);
        },
        [key, defaultValue],
      );

      React.useEffect(() => {
        if (value === null || value === undefined || value === "") {
          queryParamStore.delete(key);
          return;
        }
        queryParamStore.set(key, value);
      }, [key, value]);

      return [value, setQueryValue];
    },
  };
});

const HIDDEN_ENVIRONMENTS = [...DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS];

const TEST_FILTER_CONFIG: FilterConfig = {
  tableName: "traces",
  columnDefinitions: [
    {
      id: "environment",
      name: "Environment",
      type: "stringOptions",
      options: [],
      internal: "environment",
    },
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
      column: "environment",
      label: "Environment",
    },
    {
      type: "categorical",
      column: "name",
      label: "Name",
    },
  ],
};

const TEST_OPTIONS = {
  environment: ["production", "staging", ...HIDDEN_ENVIRONMENTS],
  name: ["checkout", "search"],
};

function SavedViewHarness() {
  const queryFilter = useSidebarFilterState(TEST_FILTER_CONFIG, TEST_OPTIONS, {
    stateLocation: "urlAndSessionStorage",
    sessionFilterContextId: null,
    implicitDefaultConfig: {
      hiddenEnvironments: [...HIDDEN_ENVIRONMENTS],
    },
  });

  const { isLoading } = useTableViewManager({
    tableName: TableViewPresetTableName.Traces,
    projectId: "project-1",
    stateUpdaters: {
      setFilters: queryFilter.setFilterState,
      setColumnOrder: () => {},
      setColumnVisibility: () => {},
    },
    validationContext: {
      columns: [],
      filterColumnDefinition: TEST_FILTER_CONFIG.columnDefinitions,
    },
    // Saved-view synchronization must compare against explicit state.
    // Effective state includes implicit environment defaults and can deadlock.
    currentFilterState: queryFilter.explicitFilterState,
  });

  return (
    <div>
      <div data-testid="loading-state">{isLoading ? "loading" : "ready"}</div>
      <pre data-testid="explicit-state">
        {JSON.stringify(queryFilter.explicitFilterState)}
      </pre>
      <pre data-testid="effective-state">
        {JSON.stringify(queryFilter.filterState)}
      </pre>
    </div>
  );
}

function ViewSelectionHarness({
  tableName = TableViewPresetTableName.Traces,
  viewPersistenceKey,
}: {
  tableName?: TableViewPresetTableName;
  viewPersistenceKey?: string;
}) {
  const [appliedFilters, setAppliedFilters] = useState<FilterState>([]);
  const { selectedViewId, handleSetViewId } = useTableViewManager({
    tableName,
    projectId: "project-1",
    stateUpdaters: {
      setFilters: setAppliedFilters,
      setColumnOrder: () => {},
      setColumnVisibility: () => {},
    },
    validationContext: {
      columns: [],
      filterColumnDefinition: TEST_FILTER_CONFIG.columnDefinitions,
    },
    currentFilterState: appliedFilters,
    viewPersistenceKey,
  });

  return (
    <div>
      <div data-testid="selected-view-id">{selectedViewId ?? "null"}</div>
      <div data-testid="applied-filter-count">{appliedFilters.length}</div>
      <button onClick={() => handleSetViewId("view-1")}>select-view</button>
      <button onClick={() => handleSetViewId(null)}>select-default</button>
    </div>
  );
}

const OLD_SAVED_VIEW_FILTERS: FilterState = [
  {
    column: "name",
    type: "stringOptions",
    operator: "any of",
    value: ["checkout"],
  },
];

describe("Saved view restore with implicit environment defaults", () => {
  let savedViewFilters: FilterState;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    queryParamStore.clear();
    savedViewFilters = OLD_SAVED_VIEW_FILTERS;

    queryParamStore.set("viewId", "view-1");
    mockUseRouter.mockReturnValue({
      isReady: true,
      query: { viewId: "view-1" },
    });

    mockGetDefaultUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });

    mockGetByIdUseQuery.mockReturnValue({
      data: {
        id: "view-1",
        name: "Old saved query without explicit env",
        tableName: TableViewPresetTableName.Traces,
        projectId: "project-1",
        orderBy: null,
        filters: savedViewFilters,
        columnOrder: null,
        columnVisibility: null,
        searchQuery: "",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "user-1",
        createdByUser: null,
      },
      error: null,
    });
  });

  it("restores old saved views and stays ready when implicit env defaults are active", async () => {
    render(<SavedViewHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state").textContent).toBe("ready");
    });

    expect(screen.getByTestId("explicit-state").textContent).toContain(
      "checkout",
    );
    expect(screen.getByTestId("effective-state").textContent).toContain(
      '"environment"',
    );
  });

  it("applies stored saved view when URL has no viewId", async () => {
    queryParamStore.delete("viewId");
    mockUseRouter.mockReturnValue({
      isReady: true,
      query: {},
    });

    sessionStorage.setItem("traces-project-1-viewId", JSON.stringify("view-1"));

    mockGetByIdUseQuery.mockReturnValue({
      data: {
        id: "view-1",
        name: "Stored saved view",
        tableName: TableViewPresetTableName.Traces,
        projectId: "project-1",
        orderBy: null,
        filters: OLD_SAVED_VIEW_FILTERS,
        columnOrder: null,
        columnVisibility: null,
        searchQuery: "",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "user-1",
        createdByUser: null,
      },
      error: null,
    });

    render(<SavedViewHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("loading-state").textContent).toBe("ready");
    });
    expect(screen.getByTestId("explicit-state").textContent).toContain(
      "checkout",
    );
  });

  it("does not re-apply a saved view after explicit default selection during bootstrap", async () => {
    queryParamStore.set("viewId", "view-1");

    mockUseRouter.mockReturnValue({
      isReady: true,
      query: { viewId: "view-1" },
    });

    // Simulate unresolved getById request so bootstrap remains in-progress.
    mockGetByIdUseQuery.mockReturnValue({
      data: undefined,
      error: null,
    });

    render(<ViewSelectionHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("view-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "select-default" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });

    await waitFor(() => {
      expect(queryParamStore.has("viewId")).toBe(false);
    });
  });

  it("ignores late saved-view responses after explicit default selection", async () => {
    let returnLateResponse = false;

    queryParamStore.set("viewId", "view-1");
    mockUseRouter.mockReturnValue({
      isReady: true,
      query: { viewId: "view-1" },
    });

    mockGetByIdUseQuery.mockImplementation(() => {
      if (!returnLateResponse) {
        return { data: undefined, error: null, isSuccess: false };
      }

      return {
        data: {
          id: "view-1",
          name: "Late response view",
          tableName: TableViewPresetTableName.Traces,
          projectId: "project-1",
          orderBy: null,
          filters: OLD_SAVED_VIEW_FILTERS,
          columnOrder: null,
          columnVisibility: null,
          searchQuery: "",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          createdBy: "user-1",
          createdByUser: null,
        },
        error: null,
      };
    });

    const { rerender } = render(<ViewSelectionHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("view-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "select-default" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });

    expect(screen.getByTestId("applied-filter-count").textContent).toBe("0");

    act(() => {
      returnLateResponse = true;
    });
    rerender(<ViewSelectionHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
      expect(screen.getByTestId("applied-filter-count").textContent).toBe("0");
    });
  });

  it("clears a permalink when the fetched saved view belongs to a different table", async () => {
    mockGetByIdUseQuery.mockReturnValue({
      data: {
        id: "view-1",
        name: "Traces saved view",
        tableName: TableViewPresetTableName.Traces,
        projectId: "project-1",
        orderBy: null,
        filters: OLD_SAVED_VIEW_FILTERS,
        columnOrder: null,
        columnVisibility: null,
        searchQuery: "",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        createdBy: "user-1",
        createdByUser: null,
      },
      error: null,
    });

    render(
      <ViewSelectionHarness
        tableName={TableViewPresetTableName.Observations}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });

    expect(screen.getByTestId("applied-filter-count").textContent).toBe("0");
    expect(queryParamStore.has("viewId")).toBe(false);
  });

  it("does not restore a stored saved view from another mode's persistence key", async () => {
    queryParamStore.delete("viewId");
    mockUseRouter.mockReturnValue({
      isReady: true,
      query: {},
    });

    sessionStorage.setItem(
      "observations-v3-project-1-viewId",
      JSON.stringify("view-1"),
    );

    render(
      <ViewSelectionHarness
        tableName={TableViewPresetTableName.Observations}
        viewPersistenceKey="observations-v4"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });

    expect(screen.getByTestId("applied-filter-count").textContent).toBe("0");
    expect(mockGetByIdUseQuery).toHaveBeenCalled();
    expect(mockGetByIdUseQuery).toHaveBeenCalledWith(
      { projectId: "project-1", viewId: null },
      expect.objectContaining({ enabled: false }),
    );
  });
});
