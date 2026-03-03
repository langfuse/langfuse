import { render, screen, waitFor } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import { useSidebarFilterState } from "./hooks/useSidebarFilterState";
import type { FilterConfig } from "./lib/filter-config";
import { useTableViewManager } from "../../components/table/table-view-presets/hooks/useTableViewManager";

const mockUseRouter = jest.fn();
const mockCapture = jest.fn();
const mockGetDefaultUseQuery = jest.fn();
const mockGetByIdUseQuery = jest.fn();

const queryParamStore = new Map<string, unknown>();

jest.mock("next/router", () => ({
  useRouter: () => mockUseRouter(),
}));

jest.mock("posthog-js/react", () => ({
  usePostHog: () => ({
    capture: mockCapture,
  }),
}));

jest.mock(
  "../../components/table/table-view-presets/components/data-table-view-presets-drawer",
  () => ({
    isSystemPresetId: () => false,
  }),
);

jest.mock("../../utils/api", () => ({
  api: {
    TableViewPresets: {
      getDefault: {
        useQuery: (...args: unknown[]) => mockGetDefaultUseQuery(...args),
      },
      getById: {
        useQuery: (...args: unknown[]) => mockGetByIdUseQuery(...args),
      },
    },
  },
}));

jest.mock("use-query-params", () => {
  const React = require("react");
  const actual = jest.requireActual("use-query-params");

  return {
    ...actual,
    StringParam: {},
    withDefault: (_param: unknown, defaultValue: unknown) => defaultValue,
    useQueryParam: (key: string, defaultValue: unknown) => {
      const initialValue = queryParamStore.has(key)
        ? queryParamStore.get(key)
        : defaultValue;
      const [value, setValue] = React.useState(initialValue);

      const setQueryValue = React.useCallback(
        (
          next: unknown | ((previous: unknown) => unknown) | null | undefined,
        ) => {
          const previous = queryParamStore.get(key);
          const resolved =
            typeof next === "function" ? next(previous) : (next ?? "");
          queryParamStore.set(key, resolved);
          setValue(resolved);
        },
        [key],
      );

      React.useEffect(() => {
        queryParamStore.set(key, value);
      }, [key, value]);

      return [value, setQueryValue];
    },
  };
});

const HIDDEN_ENVIRONMENTS = [
  "langfuse-prompt-experiment",
  "langfuse-evaluation",
  "sdk-experiment",
];

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
  environment: [
    "production",
    "staging",
    "langfuse-prompt-experiment",
    "langfuse-evaluation",
    "sdk-experiment",
  ],
  name: ["checkout", "search"],
};

type HarnessMode = "explicit" | "effective";

function SavedViewHarness(props: { mode: HarnessMode }) {
  const queryFilter = useSidebarFilterState(TEST_FILTER_CONFIG, TEST_OPTIONS, {
    implicitDefaultConfig: {
      hiddenEnvironments: [...HIDDEN_ENVIRONMENTS],
    },
  });

  const currentFilterState =
    props.mode === "explicit"
      ? queryFilter.explicitFilterState
      : queryFilter.filterState;

  const { isLoading } = useTableViewManager({
    tableName: "traces",
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
    currentFilterState,
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

const OLD_SAVED_VIEW_FILTERS: FilterState = [
  {
    column: "name",
    type: "stringOptions",
    operator: "any of",
    value: ["checkout"],
  },
];

describe("Saved view restore with implicit environment defaults", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    queryParamStore.clear();

    mockUseRouter.mockReturnValue({
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
        tableName: "traces",
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
  });

  it("reproduces deadlock when comparing saved-view sync against effective filters", async () => {
    render(<SavedViewHarness mode="effective" />);

    await waitFor(() => {
      expect(screen.getByTestId("explicit-state").textContent).toContain(
        "checkout",
      );
    });

    expect(screen.getByTestId("effective-state").textContent).toContain(
      '"environment"',
    );
    expect(screen.getByTestId("loading-state").textContent).toBe("loading");
  });

  it("unlocks when comparing saved-view sync against explicit filters", async () => {
    render(<SavedViewHarness mode="explicit" />);

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
});
