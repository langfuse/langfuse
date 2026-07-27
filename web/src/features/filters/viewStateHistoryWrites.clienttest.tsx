import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TableViewPresetTableName, type FilterState } from "@langfuse/shared";
import { useState } from "react";
import { useSidebarFilterState } from "./hooks/useSidebarFilterState";
import type { FilterConfig } from "./lib/filter-config";
import { useTableViewManager } from "../../components/table/table-view-presets/hooks/useTableViewManager";

// LFE-10715: programmatic view-state URL writes (stripping a stale frontend
// system-preset viewId, auto-applying the session default view) must REPLACE
// the current history entry, not push a new one. A push turns the pre-write
// URL into a separate history entry, so the browser Back button lands on it
// and the write re-triggers — Back bounces forward and is unusable.

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

const TEST_FILTERS: FilterState = [
  {
    column: "name",
    type: "stringOptions",
    operator: "any of",
    value: ["checkout"],
  },
];

function ViewManagerHarness({
  tableName = TableViewPresetTableName.SessionDetail,
}: {
  tableName?: TableViewPresetTableName;
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
  });

  return (
    <div>
      <div data-testid="selected-view-id">{selectedViewId ?? "null"}</div>
      <button
        onClick={() => handleSetViewId("view-1", { updateType: "replaceIn" })}
      >
        set-view-replace
      </button>
      <button onClick={() => handleSetViewId("view-1")}>set-view</button>
    </div>
  );
}

function FilterStateHarness() {
  const queryFilter = useSidebarFilterState(
    TEST_FILTER_CONFIG,
    { name: ["checkout", "search"] },
    {
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: "project-1",
    },
  );

  return (
    <div>
      <pre data-testid="explicit-state">
        {JSON.stringify(queryFilter.explicitFilterState)}
      </pre>
      <button
        onClick={() =>
          queryFilter.setFilterState(TEST_FILTERS, { updateType: "replaceIn" })
        }
      >
        set-filters-replace
      </button>
      <button onClick={() => queryFilter.setFilterState(TEST_FILTERS)}>
        set-filters
      </button>
    </div>
  );
}

describe("view-state URL writes and browser history (LFE-10715)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    queryParamStore.clear();
    urlParamWrites.length = 0;

    mockUseRouter.mockReturnValue({
      isReady: true,
      query: {},
    });
    mockGetDefaultUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
    mockGetByIdUseQuery.mockReturnValue({
      data: undefined,
      error: null,
      isSuccess: false,
      isError: false,
    });
  });

  it("strips a stale frontend system-preset viewId with a replace, not a push", async () => {
    queryParamStore.set("viewId", "__langfuse_with_io__");
    mockUseRouter.mockReturnValue({
      isReady: true,
      query: { viewId: "__langfuse_with_io__" },
    });

    render(<ViewManagerHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("selected-view-id").textContent).toBe("null");
    });

    const viewIdWrites = urlParamWrites.filter(
      (write) => write.key === "viewId",
    );
    expect(viewIdWrites.length).toBeGreaterThan(0);
    for (const write of viewIdWrites) {
      expect(write).toMatchObject({ value: null, updateType: "replaceIn" });
    }
  });

  it("forwards a replaceIn updateType through handleSetViewId", async () => {
    render(<ViewManagerHarness tableName={TableViewPresetTableName.Traces} />);

    fireEvent.click(screen.getByRole("button", { name: "set-view-replace" }));

    await waitFor(() => {
      expect(
        urlParamWrites.filter((write) => write.key === "viewId"),
      ).toContainEqual({
        key: "viewId",
        value: "view-1",
        updateType: "replaceIn",
      });
    });
  });

  it("keeps user-initiated view selection on the default (push) updateType", async () => {
    render(<ViewManagerHarness tableName={TableViewPresetTableName.Traces} />);

    fireEvent.click(screen.getByRole("button", { name: "set-view" }));

    await waitFor(() => {
      expect(
        urlParamWrites.filter((write) => write.key === "viewId"),
      ).toContainEqual({
        key: "viewId",
        value: "view-1",
        updateType: undefined,
      });
    });
  });

  it("forwards a replaceIn updateType through setFilterState", async () => {
    render(<FilterStateHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: "set-filters-replace" }),
    );

    await waitFor(() => {
      const filterWrites = urlParamWrites.filter(
        (write) => write.key === "filter",
      );
      expect(filterWrites.length).toBeGreaterThan(0);
      expect(filterWrites.at(-1)?.updateType).toBe("replaceIn");
    });
  });

  it("sanitizes a non-canonical URL filter with a replace, not a push", async () => {
    // A bookmarked/shared URL can carry a filter that decodes to a different
    // canonical form (display-name column, alias, migrated legacy shape). The
    // sanitize effect rewrites the URL on mount — a programmatic correction
    // that must not mint a history entry, or Back bounces off it re-firing
    // the sanitize (same LFE-10715 class as the viewId writes).
    const { encodeFiltersGeneric } =
      await import("./lib/filter-query-encoding");
    const canonical = encodeFiltersGeneric(TEST_FILTERS);
    expect(canonical.startsWith("name;")).toBe(true);
    const nonCanonical = canonical.replace(/^name;/, "Name;");
    queryParamStore.set("filter", nonCanonical);
    mockUseRouter.mockReturnValue({
      isReady: true,
      query: { filter: nonCanonical },
    });

    render(<FilterStateHarness />);

    await waitFor(() => {
      const filterWrites = urlParamWrites.filter(
        (write) => write.key === "filter",
      );
      expect(filterWrites.length).toBeGreaterThan(0);
      expect(filterWrites.at(-1)).toMatchObject({
        value: canonical,
        updateType: "replaceIn",
      });
    });
  });

  it("keeps user-initiated filter edits on the default (push) updateType", async () => {
    render(<FilterStateHarness />);

    fireEvent.click(screen.getByRole("button", { name: "set-filters" }));

    await waitFor(() => {
      const filterWrites = urlParamWrites.filter(
        (write) => write.key === "filter",
      );
      expect(filterWrites.length).toBeGreaterThan(0);
      expect(filterWrites.at(-1)?.updateType).toBeUndefined();
    });
  });
});
