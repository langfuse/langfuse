import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  TableViewPresetTableName,
  type FilterState,
  type TableViewPresetState,
} from "@langfuse/shared";
import { useCallback, useRef } from "react";
import { useSidebarFilterState } from "../filters/hooks/useSidebarFilterState";
import type { FilterConfig } from "../filters/lib/filter-config";
import { useTableViewManager } from "../../components/table/table-view-presets/hooks/useTableViewManager";
import {
  demoteViewOnUserFilterEdit,
  type ViewDemotionControllers,
} from "./lib/demoteViewOnUserFilterEdit";

// LFE-14699: applying a system preset chip (e.g. "Latency over 10s") writes
// `?viewId` to the URL AND to sessionStorage. Deleting the preset's filter
// used to clear only the filter layer — the stored viewId survived, so the
// next clean-URL mount ("Priority 1: Session storage" bootstrap) re-fetched
// the preset and resurrected the filter the user just deleted, with the chip
// staying lit the whole time. A user-origin filter edit must fully demote an
// active SYSTEM preset (URL + session storage). User-saved views are
// deliberately untouched (see demoteViewOnUserFilterEdit).

const mockUseRouter = vi.fn();
const mockCapture = vi.fn();
const mockGetDefaultUseQuery = vi.fn();
const mockGetByIdUseQuery = vi.fn();

const queryParamStore = new Map<string, unknown>();

/** Every URL write performed through the use-query-params setter, in order. */
const urlParamWrites: Array<{
  key: string;
  value: unknown;
  updateType: string | undefined;
}> = [];

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
    isSystemPresetId: (id: string | undefined | null) =>
      !!id?.startsWith("__langfuse_"),
  }),
);

vi.mock("../../utils/api", () => ({
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

vi.mock("use-query-params", async () => {
  const React = require("react");
  const actual = await vi.importActual("use-query-params");

  const StringParam = { __type: "string" } as const;

  return {
    ...actual,
    StringParam,
    useQueryParam: (key: string) => {
      const initialValue = queryParamStore.has(key)
        ? queryParamStore.get(key)
        : null;
      const [value, setValue] = React.useState(initialValue);

      const setQueryValue = React.useCallback(
        (
          next: unknown | ((previous: unknown) => unknown) | null | undefined,
          updateType?: string,
        ) => {
          const previous = queryParamStore.has(key)
            ? queryParamStore.get(key)
            : null;
          const resolved = typeof next === "function" ? next(previous) : next;

          urlParamWrites.push({ key, value: resolved, updateType });

          if (resolved === null || resolved === undefined || resolved === "") {
            queryParamStore.delete(key);
            setValue(null);
            return;
          }

          queryParamStore.set(key, resolved);
          setValue(resolved);
        },
        [key],
      );

      return [value, setQueryValue];
    },
  };
});

const PROJECT_ID = "project-1";
const PRESET_ID = "__langfuse_latency_over_10s";
const USER_VIEW_ID = "view-1";
const VIEW_ID_STORAGE_KEY = `${TableViewPresetTableName.ObservationsEvents}-${PROJECT_ID}-viewId`;

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

const PRESET_FILTERS: FilterState = [
  {
    column: "name",
    type: "stringOptions",
    operator: "any of",
    value: ["checkout"],
  },
];

const EXTRA_FILTERS: FilterState = [
  ...PRESET_FILTERS,
  {
    column: "name",
    type: "stringOptions",
    operator: "none of",
    value: ["search"],
  },
];

const PRESET_VIEW_STATE: TableViewPresetState = {
  filters: PRESET_FILTERS,
  orderBy: null,
  columnOrder: [],
  columnVisibility: {},
  searchQuery: "",
};

const PRESET_VIEW_DATA = {
  id: PRESET_ID,
  name: "Latency over 10s",
  tableName: TableViewPresetTableName.ObservationsEvents,
  ...PRESET_VIEW_STATE,
};

const storedViewId = () => {
  const raw = sessionStorage.getItem(VIEW_ID_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
};

/** Mirrors the EventsTable wiring: sidebar filter state with the demotion
 * callback (reading late-bound view controllers through a ref), and the view
 * manager applying saved-view filters with origin "saved_view". */
function Harness() {
  const viewControllersRef = useRef<ViewDemotionControllers | null>(null);

  const queryFilter = useSidebarFilterState(
    TEST_FILTER_CONFIG,
    { name: ["checkout", "search"] },
    {
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: PROJECT_ID,
      onExplicitFilterStateChange: (change) =>
        demoteViewOnUserFilterEdit(change, viewControllersRef.current),
    },
  );

  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;
  const setSavedViewFiltersWrapper = useCallback(
    (filters: FilterState) =>
      queryFilterRef.current.setFilterState(filters, { origin: "saved_view" }),
    [],
  );

  const { selectedViewId, appliedViewId, handleSetViewId, applyViewState } =
    useTableViewManager({
      tableName: TableViewPresetTableName.ObservationsEvents,
      projectId: PROJECT_ID,
      stateUpdaters: {
        setFilters: setSavedViewFiltersWrapper,
        setColumnOrder: () => {},
        setColumnVisibility: () => {},
      },
      validationContext: {
        columns: [],
        filterColumnDefinition: TEST_FILTER_CONFIG.columnDefinitions,
      },
      currentFilterState: queryFilter.explicitFilterState,
      allowBackendSystemPresets: true,
    });
  viewControllersRef.current = {
    selectedViewId,
    appliedViewId,
    handleSetViewId,
  };

  return (
    <div>
      <div data-testid="selected-view-id">{selectedViewId ?? "null"}</div>
      <div data-testid="applied-view-id">{appliedViewId ?? "null"}</div>
      <pre data-testid="explicit-state">
        {JSON.stringify(queryFilter.explicitFilterState)}
      </pre>
      <button
        onClick={() => {
          // Mirrors a CategoryPresetChips row click.
          handleSetViewId(PRESET_ID);
          applyViewState(PRESET_VIEW_STATE, {
            trigger: "system_preset",
            viewId: PRESET_ID,
          });
        }}
      >
        apply-preset
      </button>
      <button
        onClick={() => {
          // Mirrors the saved-views drawer's handleSelectView.
          handleSetViewId(USER_VIEW_ID);
          applyViewState(PRESET_VIEW_STATE, {
            trigger: "select",
            viewId: USER_VIEW_ID,
          });
        }}
      >
        apply-user-view
      </button>
      <button onClick={() => queryFilter.setFilterState([])}>
        user-clear-filters
      </button>
      <button onClick={() => queryFilter.setFilterState(EXTRA_FILTERS)}>
        user-add-filter
      </button>
      <button
        onClick={() =>
          queryFilter.setFilterState(queryFilterRef.current.explicitFilterState)
        }
      >
        user-recommit-same
      </button>
    </div>
  );
}

const applyPresetAndAssertActive = async () => {
  fireEvent.click(screen.getByRole("button", { name: "apply-preset" }));

  // The saved_view-origin apply must not demote itself.
  await waitFor(() => {
    expect(screen.getByTestId("selected-view-id").textContent).toBe(PRESET_ID);
    expect(screen.getByTestId("applied-view-id").textContent).toBe(PRESET_ID);
    expect(screen.getByTestId("explicit-state").textContent).toContain(
      "checkout",
    );
    expect(storedViewId()).toBe(PRESET_ID);
  });
};

describe("system preset demotion on user filter edits (LFE-14699)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    queryParamStore.clear();
    urlParamWrites.length = 0;

    mockUseRouter.mockImplementation(() => ({
      isReady: true,
      query: Object.fromEntries(queryParamStore),
    }));
    mockGetDefaultUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
    mockGetByIdUseQuery.mockImplementation(
      (input: { viewId?: string }, options?: { enabled?: boolean }) => {
        if (options?.enabled && input?.viewId === PRESET_ID) {
          return {
            data: PRESET_VIEW_DATA,
            error: null,
            isSuccess: true,
            isError: false,
          };
        }
        return {
          data: undefined,
          error: null,
          isSuccess: false,
          isError: false,
        };
      },
    );
  });

  it("restores a stored preset viewId on a clean-URL mount (the resurrection path demotion must stop)", async () => {
    sessionStorage.setItem(VIEW_ID_STORAGE_KEY, JSON.stringify(PRESET_ID));

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        PRESET_ID,
      );
      expect(screen.getByTestId("explicit-state").textContent).toContain(
        "checkout",
      );
    });
  });

  it("fully demotes an active system preset on a user filter edit; a remount does not re-apply it", async () => {
    const { unmount } = render(<Harness />);
    await applyPresetAndAssertActive();

    fireEvent.click(screen.getByRole("button", { name: "user-clear-filters" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
      expect(screen.getByTestId("applied-view-id").textContent).toBe("null");
      expect(storedViewId()).toBe(null);
    });

    // The demotion is a programmatic correction: replace, not push
    // (LFE-10715 — Back must not bounce off a resurrected viewId).
    expect(urlParamWrites).toContainEqual({
      key: "viewId",
      value: null,
      updateType: "replaceIn",
    });

    // Clean-URL remount (nav to Traces/Observations): nothing restores.
    unmount();
    expect(queryParamStore.has("viewId")).toBe(false);
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });
    expect(screen.getByTestId("explicit-state").textContent).not.toContain(
      "checkout",
    );
    expect(storedViewId()).toBe(null);
  });

  it("demotes an active system preset when the user adds a filter on top of it", async () => {
    render(<Harness />);
    await applyPresetAndAssertActive();

    fireEvent.click(screen.getByRole("button", { name: "user-add-filter" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
      expect(storedViewId()).toBe(null);
    });
  });

  it("does not demote on a no-op user write (unchanged filters)", async () => {
    render(<Harness />);
    await applyPresetAndAssertActive();

    fireEvent.click(screen.getByRole("button", { name: "user-recommit-same" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        PRESET_ID,
      );
      expect(storedViewId()).toBe(PRESET_ID);
    });
  });

  it("does not demote a user-saved view on a user filter edit (system presets only)", async () => {
    // Deliberate scoping: demoting a user-saved view (even session-only)
    // breaks the appliedViewId === selectedViewId column-trust signal the
    // drawer's "Update view" relies on (LFE-10486) — user views keep today's
    // behavior wholesale.
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        USER_VIEW_ID,
      );
      expect(storedViewId()).toBe(USER_VIEW_ID);
    });

    fireEvent.click(screen.getByRole("button", { name: "user-clear-filters" }));

    await waitFor(() => {
      expect(screen.getByTestId("explicit-state").textContent).toBe("[]");
    });
    // URL viewId AND session restore both stay: user views are untouched.
    expect(screen.getByTestId("selected-view-id").textContent).toBe(
      USER_VIEW_ID,
    );
    expect(screen.getByTestId("applied-view-id").textContent).toBe(
      USER_VIEW_ID,
    );
    expect(storedViewId()).toBe(USER_VIEW_ID);
  });
});
