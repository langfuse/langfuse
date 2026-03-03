import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import {
  buildEffectiveEnvironmentFilter,
  buildManagedEnvironmentPolicyConfig,
} from "@/src/features/filters/lib/managedEnvironmentPolicy";
import { useTableViewManager } from "./useTableViewManager";

const mockUseRouter = jest.fn();
const mockUseQueryParam = jest.fn();
const mockCapture = jest.fn();
const mockGetDefaultUseQuery = jest.fn();
const mockGetByIdUseQuery = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => mockUseRouter(),
}));

jest.mock("use-query-params", () => ({
  StringParam: {},
  withDefault: (_param: unknown, defaultValue: unknown) => defaultValue,
  useQueryParam: (...args: unknown[]) => mockUseQueryParam(...args),
}));

jest.mock("posthog-js/react", () => ({
  usePostHog: () => ({
    capture: mockCapture,
  }),
}));

jest.mock("../components/data-table-view-presets-drawer", () => ({
  isSystemPresetId: () => false,
}));

jest.mock("../../../../utils/api", () => ({
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

const hiddenEnvironments = [
  "langfuse-prompt-experiment",
  "langfuse-evaluation",
  "sdk-experiment",
];

const managedEnvironmentConfig = buildManagedEnvironmentPolicyConfig({
  hiddenEnvironments,
});

function toEffectiveFilterState(explicitFilters: FilterState): FilterState {
  return [
    ...explicitFilters.filter((filter) => filter.column !== "environment"),
    ...buildEffectiveEnvironmentFilter({
      explicitFilters,
      config: managedEnvironmentConfig,
    }),
  ];
}

type HarnessMode = "explicit" | "effective";

function UseTableViewManagerHarness(props: {
  mode: HarnessMode;
  onSetFilters: (filters: FilterState) => void;
}) {
  const { mode, onSetFilters } = props;
  const [explicitFilters, setExplicitFilters] = React.useState<FilterState>([]);

  const currentFilterState = React.useMemo(() => {
    return mode === "explicit"
      ? explicitFilters
      : toEffectiveFilterState(explicitFilters);
  }, [mode, explicitFilters]);

  const setFilters = React.useCallback(
    (filters: FilterState) => {
      onSetFilters(filters);
      setExplicitFilters(filters);
    },
    [onSetFilters],
  );

  const { isLoading } = useTableViewManager({
    tableName: "traces",
    projectId: "project-1",
    stateUpdaters: {
      setFilters,
      setColumnOrder: () => {},
      setColumnVisibility: () => {},
    },
    validationContext: {
      columns: [],
      filterColumnDefinition: [],
    },
    currentFilterState,
  });

  return (
    <div data-testid="loading-state">{isLoading ? "loading" : "ready"}</div>
  );
}

describe("useTableViewManager implicit filter synchronization", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseRouter.mockReturnValue({
      query: { viewId: "view-1" },
    });

    mockUseQueryParam.mockReturnValue([null, jest.fn()]);
    mockGetDefaultUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
    mockGetByIdUseQuery.mockReturnValue({
      data: {
        id: "view-1",
        name: "Old Saved View",
        tableName: "traces",
        projectId: "project-1",
        orderBy: null,
        filters: [],
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

  it("can stay loading when current filters include implicit environment defaults", async () => {
    const onSetFilters = jest.fn();

    render(
      <UseTableViewManagerHarness
        mode="effective"
        onSetFilters={onSetFilters}
      />,
    );

    await waitFor(() => {
      expect(onSetFilters).toHaveBeenCalledWith([]);
    });

    expect(screen.getByTestId("loading-state").textContent).toBe("loading");
  });

  it("unlocks when current filters track explicit filter state", async () => {
    const onSetFilters = jest.fn();

    render(
      <UseTableViewManagerHarness
        mode="explicit"
        onSetFilters={onSetFilters}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading-state").textContent).toBe("ready");
    });
  });
});
