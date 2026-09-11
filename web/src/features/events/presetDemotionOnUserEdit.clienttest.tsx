import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  TableViewPresetTableName,
  encodeFiltersGeneric,
  type FilterState,
  type TableViewPresetState,
} from "@langfuse/shared";
import { useCallback, useRef } from "react";
import { useStore } from "zustand";
import { useEventsTableSearch } from "./hooks/useEventsTableSearch";
import {
  type FilterConfig,
  useSidebarFilterState,
} from "@/src/features/filters";
import { useTableViewManager } from "../../components/table/table-view-presets/hooks/useTableViewManager";
import { KeyValueFilterBuilder } from "@/src/components/table/key-value-filter-builder";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import {
  demoteViewOnUserFilterEdit,
  type ViewDemotionControllers,
} from "./lib/demoteViewOnUserFilterEdit";

// Editing an applied view clears its selection in both URL and session
// storage, so a later table visit cannot restore the filters just edited.

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
    {
      id: "metadata",
      name: "Metadata",
      type: "stringObject",
      internal: "metadata",
    },
  ],
  facets: [
    {
      type: "categorical",
      column: "name",
      label: "Name",
    },
    { type: "stringKeyValue", column: "metadata", label: "Metadata" },
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

const USER_VIEW_STATE: TableViewPresetState = {
  ...PRESET_VIEW_STATE,
  filters: [
    ...PRESET_FILTERS,
    {
      column: "metadata",
      type: "stringObject",
      key: "region",
      operator: "=",
      value: "eu",
    },
  ],
};

const storedViewId = () => {
  const raw = sessionStorage.getItem(VIEW_ID_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
};

/** Mirrors the EventsTable wiring: sidebar filter state with the demotion
 * callback (reading late-bound view controllers through a ref), and the view
 * manager applying saved-view filters with origin "saved_view". */
function Harness({ projectId = PROJECT_ID }: { projectId?: string }) {
  const viewControllersRef = useRef<ViewDemotionControllers | null>(null);
  const [orderBy, setOrderBy] = useOrderByState(null);
  const resetSearchDraftRef = useRef<((filters: FilterState) => void) | null>(
    null,
  );

  const queryFilter = useSidebarFilterState(
    TEST_FILTER_CONFIG,
    { name: ["checkout", "search"] },
    {
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
      onExplicitFilterStateChange: (change) => {
        demoteViewOnUserFilterEdit(change, viewControllersRef.current);
        if (change.origin === "user" && change.action === "clear") {
          resetSearchDraftRef.current?.(change.nextFilters);
        }
      },
    },
  );

  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;
  const setSavedViewFiltersWrapper = useCallback(
    (filters: FilterState) =>
      queryFilterRef.current.setFilterState(filters, { origin: "saved_view" }),
    [],
  );
  const searchBar = useEventsTableSearch({
    projectId,
    tableName: "observations-events",
    enabled: true,
    useHostSearchScopes: false,
    filterState: queryFilter.searchBarFilterState,
    searchQuery: null,
    searchType: ["id", "content"],
    observed: undefined,
    setFilterState: queryFilter.setFilterState,
    setSearchQuery: () => {},
    setSearchType: () => {},
  });
  const searchDraft = useStore(searchBar.store, (state) => state.draft);
  resetSearchDraftRef.current = (filters) =>
    searchBar.resetDraft({
      filters: queryFilter.projectFiltersForSearchBar(filters),
      searchQuery: null,
      searchType: ["id", "content"],
    });

  const {
    selectedViewId,
    appliedViewId,
    viewUpdateTarget,
    filterEditorResetKey,
    handleSetViewId,
    handleUserStateChange,
    applyViewState,
  } = useTableViewManager({
    tableName: TableViewPresetTableName.ObservationsEvents,
    projectId,
    stateUpdaters: {
      setFilters: setSavedViewFiltersWrapper,
      setOrderBy,
      setColumnOrder: () => {},
      setColumnVisibility: () => {},
    },
    validationContext: {
      columns: [],
      filterColumnDefinition: TEST_FILTER_CONFIG.columnDefinitions,
    },
    currentFilterState: queryFilter.explicitFilterState,
    allowBackendSystemPresets: true,
    onViewApplied: (viewState) =>
      searchBar.resetDraft({
        filters: queryFilter.projectFiltersForSearchBar(viewState.filters),
        searchQuery: viewState.searchQuery ?? null,
        searchType: ["id", "content"],
      }),
  });
  viewControllersRef.current = {
    selectedViewId,
    handleSetViewId,
    handleUserStateChange,
  };
  const metadataFacet = queryFilter.filters.find(
    (filter) => filter.type === "stringKeyValue",
  );
  if (!metadataFacet) throw new Error("Missing metadata facet");

  return (
    <div>
      <div data-testid="selected-view-id">{selectedViewId ?? "null"}</div>
      <div data-testid="applied-view-id">{appliedViewId ?? "null"}</div>
      <pre data-testid="view-update-target">
        {JSON.stringify(viewUpdateTarget ?? null)}
      </pre>
      <pre data-testid="explicit-state">
        {JSON.stringify(queryFilter.explicitFilterState)}
      </pre>
      <textarea
        aria-label="Search draft"
        value={searchDraft}
        onChange={(event) =>
          searchBar.store.getState().actions.setDraft(event.target.value)
        }
      />
      <KeyValueFilterBuilder
        key={filterEditorResetKey}
        mode="string"
        activeFilters={metadataFacet.value}
        onChange={metadataFacet.onChange}
      />
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
          applyViewState(USER_VIEW_STATE, {
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
      <button
        onClick={() => {
          handleSetViewId(USER_VIEW_ID);
          applyViewState({ ...USER_VIEW_STATE, filters: [] });
        }}
      >
        apply-empty-view
      </button>
      <button onClick={queryFilter.clearAll}>clear-all</button>
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
      <button
        onClick={() =>
          queryFilter.setFilterState(EXTRA_FILTERS, { origin: "system" })
        }
      >
        system-reconcile
      </button>
      <button
        onClick={() => {
          handleUserStateChange(orderBy, null);
          setOrderBy(null);
        }}
      >
        user-keep-sort
      </button>
      <button
        onClick={() => {
          const nextOrderBy = { column: "name", order: "ASC" as const };
          handleUserStateChange(orderBy, nextOrderBy);
          setOrderBy(nextOrderBy);
        }}
      >
        user-sort
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

describe("saved-view demotion on user filter edits", () => {
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

  it("preserves selection for no-op edits and system reconciliation", async () => {
    render(<Harness />);
    await applyPresetAndAssertActive();

    fireEvent.click(screen.getByRole("button", { name: "user-recommit-same" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        PRESET_ID,
      );
      expect(storedViewId()).toBe(PRESET_ID);
    });

    fireEvent.click(screen.getByRole("button", { name: "system-reconcile" }));
    await waitFor(() => {
      expect(screen.getByTestId("explicit-state").textContent).toContain(
        "search",
      );
    });
    expect(screen.getByTestId("selected-view-id").textContent).toBe(PRESET_ID);
    expect(storedViewId()).toBe(PRESET_ID);
  });

  it("discards an invalid search draft when explicitly reapplying the same empty view", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "apply-empty-view" }));
    const draft = screen.getByRole("textbox", { name: "Search draft" });
    fireEvent.change(draft, { target: { value: "level:(" } });
    expect(draft).toHaveValue("level:(");
    fireEvent.click(screen.getByRole("button", { name: "apply-empty-view" }));
    expect(draft).toHaveValue("");
  });

  it("discards an invalid search draft when clearing an already-empty applied filter state", async () => {
    render(<Harness />);
    const draft = screen.getByRole("textbox", { name: "Search draft" });
    fireEvent.change(draft, { target: { value: "level:(" } });
    fireEvent.click(screen.getByRole("button", { name: "clear-all" }));
    expect(draft).toHaveValue("");
  });

  it("preserves a search draft while a sorting edit deselects its view", async () => {
    render(<Harness />);
    await applyPresetAndAssertActive();
    const draft = screen.getByRole("textbox", { name: "Search draft" });
    fireEvent.change(draft, { target: { value: "level:(" } });
    fireEvent.click(screen.getByRole("button", { name: "user-sort" }));
    expect(draft).toHaveValue("level:(");
    expect(screen.getByTestId("selected-view-id")).toHaveTextContent("null");
  });

  it("leaves an empty saved view on Clear all and retains its update destination", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "apply-empty-view" }));
    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        USER_VIEW_ID,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "clear-all" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });
    expect(storedViewId()).toBe(null);
    expect(queryParamStore.has("viewId")).toBe(false);
    expect(screen.getByTestId("view-update-target").textContent).toContain(
      USER_VIEW_ID,
    );
  });

  it("clears a user-saved view from shared state, URL and session on an actual filter edit", async () => {
    const { unmount } = render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        USER_VIEW_ID,
      );
      expect(storedViewId()).toBe(USER_VIEW_ID);
    });

    fireEvent.click(screen.getByRole("button", { name: "user-recommit-same" }));
    expect(screen.getByTestId("selected-view-id").textContent).toBe(
      USER_VIEW_ID,
    );
    expect(storedViewId()).toBe(USER_VIEW_ID);

    fireEvent.click(screen.getByRole("button", { name: "user-clear-filters" }));

    await waitFor(() => {
      expect(screen.getByTestId("explicit-state").textContent).toBe("[]");
    });
    expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    expect(screen.getByTestId("applied-view-id").textContent).toBe("null");
    expect(queryParamStore.has("viewId")).toBe(false);
    expect(storedViewId()).toBe(null);
    expect(urlParamWrites).toContainEqual({
      key: "viewId",
      value: null,
      updateType: "replaceIn",
    });
    const updateTarget = {
      viewId: USER_VIEW_ID,
      columnsApplied: true,
    };
    expect(
      JSON.parse(screen.getByTestId("view-update-target").textContent!),
    ).toEqual(updateTarget);
    unmount();
    mockGetDefaultUseQuery.mockReturnValue({
      data: { viewId: USER_VIEW_ID, scope: "project" },
      isLoading: false,
    });
    render(<Harness />);
    expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    expect(
      JSON.parse(screen.getByTestId("view-update-target").textContent!),
    ).toEqual(updateTarget);
    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));
    expect(screen.getByTestId("view-update-target").textContent).toBe("null");
  });

  it("keeps an edited view's update target scoped to its project during navigation", async () => {
    const otherProjectId = "project-2";
    const { rerender, unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));
    fireEvent.click(screen.getByRole("button", { name: "user-clear-filters" }));

    const updateTarget = { viewId: USER_VIEW_ID, columnsApplied: true };
    const storageKey = (projectId: string) =>
      `${TableViewPresetTableName.ObservationsEvents}-${projectId}-viewUpdateTarget`;
    expect(JSON.parse(sessionStorage.getItem(storageKey(PROJECT_ID))!)).toEqual(
      updateTarget,
    );

    rerender(<Harness projectId={otherProjectId} />);
    await waitFor(() => {
      expect(screen.getByTestId("view-update-target").textContent).toBe("null");
    });
    expect(sessionStorage.getItem(storageKey(otherProjectId))).toBe("null");
    expect(JSON.parse(sessionStorage.getItem(storageKey(PROJECT_ID))!)).toEqual(
      updateTarget,
    );

    unmount();
    mockGetDefaultUseQuery.mockReturnValue({
      data: { viewId: PRESET_ID, scope: "project" },
      isLoading: false,
    });
    render(<Harness projectId={otherProjectId} />);
    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        PRESET_ID,
      );
      expect(screen.getByTestId("explicit-state").textContent).toContain(
        "checkout",
      );
    });
  });

  it("clears both IDs after editing a shared view whose session ID is stale", async () => {
    // A shared link with explicit state can leave the prior session ID intact.
    sessionStorage.setItem(VIEW_ID_STORAGE_KEY, JSON.stringify(PRESET_ID));
    queryParamStore.set("viewId", USER_VIEW_ID);
    queryParamStore.set("filter", encodeFiltersGeneric(PRESET_FILTERS));

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe(
        USER_VIEW_ID,
      );
      expect(screen.getByTestId("explicit-state").textContent).toContain(
        "checkout",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "user-add-filter" }));

    await waitFor(() => {
      expect(screen.getByTestId("explicit-state").textContent).toContain(
        "search",
      );
    });
    expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    expect(screen.getByTestId("applied-view-id").textContent).toBe("null");
    expect(queryParamStore.has("viewId")).toBe(false);
    expect(storedViewId()).toBe(null);
    expect(
      JSON.parse(screen.getByTestId("view-update-target").textContent!),
    ).toEqual({
      viewId: USER_VIEW_ID,
      columnsApplied: false,
    });
  });

  it("preserves an incomplete metadata edit on deselection and resets drafts only when a view is applied", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));

    const value = screen.getByDisplayValue("eu");
    act(() => value.focus());
    fireEvent.change(value, { target: { value: "" } });

    expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    expect(queryParamStore.has("viewId")).toBe(false);
    expect(storedViewId()).toBe(null);
    expect(screen.getByDisplayValue("region")).toBeInTheDocument();
    expect(value).toHaveFocus();

    fireEvent.change(screen.getByDisplayValue("region"), {
      target: { value: "draft-region" },
    });
    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));
    expect(screen.queryByDisplayValue("draft-region")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("eu")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Add filter"));
    fireEvent.change(screen.getAllByPlaceholderText("Key")[1], {
      target: { value: "pending-key" },
    });
    expect(screen.getByTestId("selected-view-id").textContent).toBe(
      USER_VIEW_ID,
    );
    fireEvent.click(screen.getByRole("button", { name: "apply-user-view" }));
    expect(screen.queryByDisplayValue("pending-key")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("eu")).toBeInTheDocument();
  });

  it("keeps selection for unchanged sorting and clears it when the sort changes", async () => {
    render(<Harness />);
    await applyPresetAndAssertActive();

    fireEvent.click(screen.getByRole("button", { name: "user-keep-sort" }));
    expect(queryParamStore.get("viewId")).toBe(PRESET_ID);
    expect(storedViewId()).toBe(PRESET_ID);

    fireEvent.click(screen.getByRole("button", { name: "user-sort" }));
    expect(queryParamStore.get("orderBy")).toEqual({
      column: "name",
      order: "ASC",
    });
    expect(queryParamStore.has("viewId")).toBe(false);
    expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    expect(storedViewId()).toBe(null);
  });
});
