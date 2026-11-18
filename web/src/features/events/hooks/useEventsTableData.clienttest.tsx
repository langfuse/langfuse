import { act, render, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  focusManager,
  onlineManager,
  QueryClientProvider,
  type UseQueryOptions,
  type useQuery,
} from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type TableDataScope } from "@/src/components/table/utils/tablePlaceholder";
import { api } from "@/src/utils/api";
import { usePaginationWindowPin } from "@/src/components/table/hooks/usePaginationWindowPin";
import { refreshEventsTable } from "../lib/refreshEventsTable";
import { EventsOutlierStrip } from "../components/outlier-strip/EventsOutlierStrip";
import { useEventsFilterOptions } from "./useEventsFilterOptions";
import { useEventsTableData } from "./useEventsTableData";

const queryHandlers = vi.hoisted(
  () => ({}) as Record<string, ((input: any) => Promise<unknown>) | undefined>,
);

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/hooks/useElementSize", () => ({
  useElementSize: () => [null, { width: 1048, height: 120 }],
}));

vi.mock("@/src/utils/api", async () => {
  const { useQuery: useActualQuery } = await vi.importActual<{
    useQuery: typeof useQuery;
  }>("@tanstack/react-query");
  const query = (name: string) => ({
    useQuery: (
      input: unknown,
      options: Omit<UseQueryOptions, "queryKey" | "queryFn">,
    ) =>
      useActualQuery({
        queryKey: [name, name === "dashboard.executeQuery" ? { input } : input],
        queryFn: () =>
          queryHandlers[name]?.(input) ?? new Promise<never>(() => {}),
        ...options,
      }),
  });
  return {
    sendAsPostOption: {},
    api: {
      events: {
        all: query("events.all"),
        batchIO: query("events.batchIO"),
        countAll: query("events.countAll"),
        filterOptions: query("events.filterOptions"),
      },
      dashboard: { executeQuery: query("dashboard.executeQuery") },
      useQueries: (
        _build: unknown,
        options: { combine: (results: unknown[]) => unknown },
      ) => options.combine([]),
      annotationQueueItems: { createMany: { useMutation: () => ({}) } },
    },
  };
});

const ROWS_SCOPE: TableDataScope = {
  projectId: "project-a",
  filter: [],
  timeRange: { range: "last1Day" },
};
const FILTERED_SCOPE: TableDataScope = {
  ...ROWS_SCOPE,
  filter: [
    { column: "name", type: "string", operator: "=", value: "generation" },
  ],
};

function createDeferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stubAnimationFrames() {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  return {
    pendingCount: () => frames.size,
    runFrame: () => {
      const callbacks = [...frames.values()];
      frames.clear();
      act(() => callbacks.forEach((callback) => callback(0)));
    },
  };
}

describe("auxiliary data gate", () => {
  let rowRequests: ReturnType<typeof createDeferred>[];
  let frames: ReturnType<typeof stubAnimationFrames>;
  let client: QueryClient;

  beforeEach(() => {
    rowRequests = [];
    frames = stubAnimationFrames();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryHandlers["events.all"] = () => {
      const request = createDeferred();
      rowRequests.push(request);
      return request.promise;
    };
  });

  afterEach(() => {
    delete queryHandlers["events.all"];
    delete queryHandlers["events.countAll"];
    client.clear();
    vi.unstubAllGlobals();
  });

  const isCountFetching = () =>
    client.isFetching({ queryKey: ["events.countAll"] }) > 0;
  const rowsOf = (observations: unknown[]) => ({
    observations,
    hasMore: false,
  });

  function renderGate(
    initial: {
      scope: TableDataScope;
      page?: number;
      orderBy?: { column: string; order: "ASC" | "DESC" } | null;
    },
    { rowsEnabled = true }: { rowsEnabled?: boolean } = {},
  ) {
    return renderHook(
      ({
        scope,
        page = 1,
        orderBy = null,
      }: {
        scope: TableDataScope;
        page?: number;
        orderBy?: { column: string; order: "ASC" | "DESC" } | null;
      }) =>
        useEventsTableData({
          projectId: scope.projectId,
          filterState: scope.filter,
          tableDataScope: scope,
          paginationState: { page, limit: 50 },
          orderByState: orderBy,
          selectedRows: {},
          selectAll: true,
          setSelectedRows: () => {},
          rowsEnabled,
        }),
      {
        initialProps: initial,
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
  }

  async function resolveRows(index: number, rows: unknown[]) {
    await act(async () => rowRequests[index]!.resolve(rowsOf(rows)));
  }

  function paint() {
    frames.runFrame();
    frames.runFrame();
  }

  it("holds auxiliary queries while rows load and releases them after two frames", async () => {
    const { result } = renderGate({ scope: ROWS_SCOPE });

    expect(result.current.canLoadAuxiliaryData).toBe(false);
    expect(result.current.isTotalCountLoading).toBe(true);
    expect(isCountFetching()).toBe(false);

    await resolveRows(0, [{ id: "observation-a" }]);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    expect(result.current.canLoadAuxiliaryData).toBe(false);
    expect(isCountFetching()).toBe(false);

    frames.runFrame();
    expect(result.current.canLoadAuxiliaryData).toBe(false);
    frames.runFrame();
    expect(result.current.canLoadAuxiliaryData).toBe(true);
    await waitFor(() => expect(isCountFetching()).toBe(true));
  });

  it("releases the gate when the rows load empty", async () => {
    const { result } = renderGate({ scope: ROWS_SCOPE });

    await resolveRows(0, []);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    paint();

    expect(result.current.canLoadAuxiliaryData).toBe(true);
    await waitFor(() => expect(isCountFetching()).toBe(true));
  });

  it("releases the gate when the row query fails", async () => {
    const { result } = renderGate({ scope: ROWS_SCOPE });

    await act(async () => rowRequests[0]!.reject(new Error("rows failed")));
    await waitFor(() =>
      expect(result.current.observations.status).toBe("error"),
    );
    paint();

    expect(result.current.canLoadAuxiliaryData).toBe(true);
    await waitFor(() => expect(isCountFetching()).toBe(true));
  });

  it("changing page does not refetch or re-gate auxiliary queries", async () => {
    let countRequests = 0;
    queryHandlers["events.countAll"] = async () => {
      countRequests += 1;
      return { totalCount: 7, uniqueTraceCount: 3 };
    };
    const { result, rerender } = renderGate({ scope: ROWS_SCOPE });
    await resolveRows(0, [{ id: "page-1" }]);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    paint();
    await waitFor(() => expect(result.current.totalCount).toBe(7));
    expect(countRequests).toBe(1);

    rerender({ scope: ROWS_SCOPE, page: 2 });
    expect(result.current.observations.rows).toEqual([{ id: "page-1" }]);
    expect(result.current.canLoadAuxiliaryData).toBe(true);
    expect(result.current.totalCount).toBe(7);

    await resolveRows(1, [{ id: "page-2" }]);
    await waitFor(() =>
      expect(result.current.observations.rows).toEqual([{ id: "page-2" }]),
    );
    paint();
    expect(result.current.canLoadAuxiliaryData).toBe(true);
    expect(countRequests).toBe(1);
  });

  it("changing sort does not refetch or re-gate auxiliary queries", async () => {
    let countRequests = 0;
    queryHandlers["events.countAll"] = async () => {
      countRequests += 1;
      return { totalCount: 7, uniqueTraceCount: 3 };
    };
    const { result, rerender } = renderGate({ scope: ROWS_SCOPE });
    await resolveRows(0, [{ id: "unsorted" }]);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    paint();
    await waitFor(() => expect(result.current.totalCount).toBe(7));

    rerender({
      scope: ROWS_SCOPE,
      orderBy: { column: "startTime", order: "ASC" },
    });
    expect(result.current.canLoadAuxiliaryData).toBe(true);
    await resolveRows(1, [{ id: "sorted" }]);
    await waitFor(() =>
      expect(result.current.observations.rows).toEqual([{ id: "sorted" }]),
    );
    paint();
    expect(result.current.canLoadAuxiliaryData).toBe(true);
    expect(countRequests).toBe(1);
  });

  it.each([
    { otherFilter: "loaded", loadOtherFilter: true },
    { otherFilter: "still loading", loadOtherFilter: false },
  ])(
    "holds auxiliary queries while the cached rows of a revisited filter refetch (other filter $otherFilter)",
    async ({ loadOtherFilter }) => {
      let countRequests = 0;
      queryHandlers["events.countAll"] = async () => {
        countRequests += 1;
        return { totalCount: 7, uniqueTraceCount: 3 };
      };
      const { result, rerender } = renderGate({ scope: ROWS_SCOPE });
      await resolveRows(0, [{ id: "unfiltered" }]);
      await waitFor(() =>
        expect(result.current.observations.status).toBe("success"),
      );
      paint();
      await waitFor(() => expect(countRequests).toBe(1));

      rerender({ scope: FILTERED_SCOPE });
      expect(result.current.canLoadAuxiliaryData).toBe(false);
      if (loadOtherFilter) {
        await resolveRows(1, [{ id: "filtered" }]);
        await waitFor(() =>
          expect(result.current.observations.rows).toEqual([
            { id: "filtered" },
          ]),
        );
        paint();
        await waitFor(() => expect(countRequests).toBe(2));
      }
      const countRequestsBeforeReturn = countRequests;

      // Back to the first filter: its cached rows show at once and refetch.
      rerender({ scope: ROWS_SCOPE });
      expect(result.current.observations.rows).toEqual([{ id: "unfiltered" }]);
      await waitFor(() => expect(rowRequests).toHaveLength(3));
      paint();
      await act(async () => {});
      expect(result.current.canLoadAuxiliaryData).toBe(false);
      expect(countRequests).toBe(countRequestsBeforeReturn);

      await resolveRows(2, [{ id: "unfiltered" }]);
      await waitFor(() =>
        expect(result.current.canLoadAuxiliaryData).toBe(true),
      );
      await waitFor(() =>
        expect(countRequests).toBe(countRequestsBeforeReturn + 1),
      );
    },
  );

  it("does not start auxiliary fetches while rows refetch but keeps loaded data in place", async () => {
    queryHandlers["events.countAll"] = async () => ({
      totalCount: 7,
      uniqueTraceCount: 3,
    });
    const { result } = renderGate({ scope: ROWS_SCOPE });
    await resolveRows(0, [{ id: "observation-a" }]);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    paint();
    expect(result.current.canLoadAuxiliaryData).toBe(true);
    await waitFor(() => expect(result.current.totalCount).toBe(7));

    await act(async () => {
      client.invalidateQueries({ queryKey: ["events.all"] });
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.canLoadAuxiliaryData).toBe(false);
    // Already loaded auxiliary data stays in place while the gate is closed.
    expect(result.current.totalCount).toBe(7);
    expect(result.current.isTotalCountLoading).toBe(false);

    await resolveRows(1, [{ id: "observation-a" }]);
    await waitFor(() => expect(result.current.canLoadAuxiliaryData).toBe(true));
  });

  it("re-arms on a new row scope and cancels pending frames", async () => {
    const { result, rerender, unmount } = renderGate({ scope: ROWS_SCOPE });
    await resolveRows(0, [{ id: "observation-a" }]);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    frames.runFrame();
    expect(frames.pendingCount()).toBe(1);

    rerender({ scope: FILTERED_SCOPE });
    expect(frames.pendingCount()).toBe(0);
    expect(result.current.canLoadAuxiliaryData).toBe(false);

    await resolveRows(1, [{ id: "observation-b" }]);
    await waitFor(() =>
      expect(result.current.observations.status).toBe("success"),
    );
    frames.runFrame();
    expect(frames.pendingCount()).toBe(1);
    unmount();
    expect(frames.pendingCount()).toBe(0);
  });

  it("stays closed while the primary row query refetches behind a cached fallback", async () => {
    const fallbackRequests: ReturnType<typeof createDeferred>[] = [];
    const rootScope: TableDataScope = {
      ...ROWS_SCOPE,
      filter: [
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    };
    const isPrimary = (input: { filter: unknown[] }) =>
      JSON.stringify(input.filter).includes("isRootObservation");
    queryHandlers["events.all"] = (input) => {
      const request = createDeferred();
      (isPrimary(input) ? rowRequests : fallbackRequests).push(request);
      return request.promise;
    };
    const { result } = renderHook(
      () =>
        useEventsTableData({
          projectId: rootScope.projectId,
          filterState: rootScope.filter,
          tableDataScope: rootScope,
          paginationState: { page: 1, limit: 50 },
          orderByState: null,
          selectedRows: {},
          selectAll: false,
          setSelectedRows: () => {},
          appRootFallbackEnabled: true,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await resolveRows(0, []);
    await waitFor(() => expect(fallbackRequests).toHaveLength(1));
    await act(async () =>
      fallbackRequests[0]!.resolve(rowsOf([{ id: "fallback" }])),
    );
    await waitFor(() => expect(result.current.usedAppRootFallback).toBe(true));
    paint();
    expect(result.current.canLoadAuxiliaryData).toBe(true);

    await act(async () => {
      client.invalidateQueries({
        queryKey: ["events.all"],
        predicate: (query) =>
          isPrimary(query.queryKey[1] as { filter: unknown[] }),
      });
    });
    await waitFor(() => expect(rowRequests).toHaveLength(2));
    expect(result.current.canLoadAuxiliaryData).toBe(false);

    await resolveRows(1, []);
    await waitFor(() => expect(result.current.canLoadAuxiliaryData).toBe(true));
  });

  it("does not wait for rows when row queries are disabled", () => {
    const { result } = renderGate(
      { scope: ROWS_SCOPE },
      { rowsEnabled: false },
    );

    expect(result.current.canLoadAuxiliaryData).toBe(true);
    expect(rowRequests).toHaveLength(0);
  });
});

it("does not relabel cached non-root rows when the disabled fallback observes them", () => {
  const client = new QueryClient();
  const scope: TableDataScope = {
    projectId: "project-a",
    filter: [],
    timeRange: { range: "last1Day" },
  };
  client.setQueryData(
    [
      "events.all",
      {
        projectId: scope.projectId,
        filter: [],
        searchQuery: null,
        searchType: ["id", "content"],
        orderBy: null,
        page: 1,
        limit: 50,
      },
    ],
    {
      observations: [{ id: "non-root" }],
      hasMore: false,
    },
  );

  const { result, rerender, unmount } = renderHook(
    ({ tableDataScope }: { tableDataScope: TableDataScope }) =>
      useEventsTableData({
        projectId: scope.projectId,
        filterState: tableDataScope.filter,
        tableDataScope,
        paginationState: { page: 1, limit: 50 },
        orderByState: null,
        selectedRows: {},
        selectAll: false,
        setSelectedRows: () => {},
      }),
    {
      initialProps: { tableDataScope: scope },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.observations.rows).toEqual([{ id: "non-root" }]);

  const rootScope: TableDataScope = {
    ...scope,
    filter: [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ],
  };
  rerender({ tableDataScope: rootScope });
  // The fallback observer updates shared query metadata after the first render.
  rerender({ tableDataScope: rootScope });
  expect(result.current.observations.status).toBe("loading");
  expect(result.current.observations.rows).toBeUndefined();

  unmount();
  client.clear();
});

describe("auxiliary queries wired as in the events table", () => {
  let rowRequests: ReturnType<typeof createDeferred>[];
  let frames: ReturnType<typeof stubAnimationFrames>;
  let client: QueryClient;
  let calls: Record<string, number>;
  type Range = { from: Date; to?: Date };
  type Props = {
    page?: number;
    orderBy?: { column: string; order: "ASC" | "DESC" } | null;
    range?: Range;
  };
  const RANGE: Range = { from: new Date("2026-01-01T00:00:00.000Z") };

  beforeEach(() => {
    rowRequests = [];
    calls = {};
    frames = stubAnimationFrames();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryHandlers["events.all"] = () => {
      const request = createDeferred();
      rowRequests.push(request);
      return request.promise;
    };
    for (const name of [
      "events.countAll",
      "events.filterOptions",
      "dashboard.executeQuery",
    ]) {
      queryHandlers[name] = async () => {
        calls[name] = (calls[name] ?? 0) + 1;
        return name === "events.countAll"
          ? { totalCount: 7, uniqueTraceCount: 3 }
          : {};
      };
    }
  });

  afterEach(() => {
    for (const name of Object.keys(queryHandlers)) delete queryHandlers[name];
    client.clear();
    vi.unstubAllGlobals();
  });

  function renderWired(initial: Props = {}) {
    return renderHook(
      ({ page = 1, orderBy = null, range = RANGE }: Props) => {
        // Rows and count take the pinned window, facets and strip the open one.
        const { range: rowsRange, pinOnLeavingFirstPage } =
          usePaginationWindowPin(range, page - 1);
        const data = useEventsTableData({
          projectId: "project-a",
          // The row payload carries the resolved bounds; the scope only the
          // relative preset.
          filterState: [
            {
              column: "startTime",
              type: "datetime",
              operator: ">=",
              value: range.from,
            },
            ...(rowsRange?.to
              ? [
                  {
                    column: "startTime",
                    type: "datetime" as const,
                    operator: "<=" as const,
                    value: rowsRange.to,
                  },
                ]
              : []),
          ],
          tableDataScope: ROWS_SCOPE,
          paginationState: { page, limit: 50 },
          orderByState: orderBy,
          selectedRows: {},
          selectAll: true,
          setSelectedRows: () => {},
          auxiliaryDateRange: range,
        });
        useEventsFilterOptions({
          projectId: "project-a",
          startTimeFilter: [
            {
              column: "startTime",
              type: "datetime",
              operator: ">=",
              value: range.from,
            },
          ],
          columns: ["name"],
          enabled: data.canLoadAuxiliaryData,
          deferred: !data.canLoadAuxiliaryData,
        });
        // The outlier strip: independent of rows, page and sort.
        api.dashboard.executeQuery.useQuery(
          { range } as never,
          {
            enabled: data.canLoadAuxiliaryData,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          } as never,
        );
        return { ...data, pinOnLeavingFirstPage };
      },
      {
        initialProps: initial,
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
  }

  it("dims the previous filter's strip while deferred and fetching, then restores current data", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-02T00:00:00.000Z");
    const stripRows = (count: number) => [
      { time_dimension: from.toISOString(), count_count: count },
    ];
    const filtered = createDeferred();
    const fetchStrip = vi
      .fn()
      .mockResolvedValueOnce(stripRows(3))
      .mockReturnValueOnce(filtered.promise);
    queryHandlers["dashboard.executeQuery"] = fetchStrip;

    const strip = (enabled: boolean, filterState = ROWS_SCOPE.filter) => (
      <QueryClientProvider client={client}>
        <EventsOutlierStrip
          projectId="project-a"
          filterState={filterState}
          fromTimestamp={from}
          toTimestamp={to}
          enabled={enabled}
          onSelectRange={() => {}}
        />
      </QueryClientProvider>
    );
    const view = render(strip(true));
    const bandContent = () =>
      view.container.querySelector(".transition-opacity");
    await waitFor(() => expect(bandContent()).not.toBeNull());
    expect(bandContent()).not.toHaveClass("opacity-60");

    view.rerender(strip(false, FILTERED_SCOPE.filter));
    expect(fetchStrip).toHaveBeenCalledTimes(1);
    expect(client.isFetching({ queryKey: ["dashboard.executeQuery"] })).toBe(0);
    expect(bandContent()).toHaveClass("opacity-60");

    view.rerender(strip(true, FILTERED_SCOPE.filter));
    await waitFor(() => expect(fetchStrip).toHaveBeenCalledTimes(2));
    expect(bandContent()).toHaveClass("opacity-60");

    await act(async () => filtered.resolve(stripRows(7)));
    await waitFor(() => expect(bandContent()).not.toHaveClass("opacity-60"));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(fetchStrip).toHaveBeenCalledTimes(2);
    focusManager.setFocused(undefined);
  });

  const paint = () => {
    frames.runFrame();
    frames.runFrame();
  };
  const resolve = (index: number, id: string) =>
    act(async () =>
      rowRequests[index]!.resolve({ observations: [{ id }], hasMore: false }),
    );
  const auxCounts = () => [
    calls["events.countAll"],
    calls["events.filterOptions"],
    calls["dashboard.executeQuery"],
  ];

  async function loadFirstPage(view: ReturnType<typeof renderWired>) {
    await resolve(0, "first");
    await waitFor(() =>
      expect(view.result.current.observations.status).toBe("success"),
    );
    paint();
    await waitFor(() => expect(auxCounts()).toEqual([1, 1, 1]));
  }

  const PIN = new Date("2026-01-01T00:30:00.000Z");
  const leaveFirstPage = (view: ReturnType<typeof renderWired>) =>
    act(() => view.result.current.pinOnLeavingFirstPage(1, PIN));

  async function visitAndReturn(
    view: ReturnType<typeof renderWired>,
    changed: Props,
  ) {
    view.rerender(changed);
    expect(view.result.current.canLoadAuxiliaryData).toBe(true);
    await resolve(1, "changed");
    await waitFor(() =>
      expect(view.result.current.observations.rows).toEqual([
        { id: "changed" },
      ]),
    );
    paint();

    // Back to the cached first view: its stale refetch is navigation.
    view.rerender({});
    expect(view.result.current.observations.rows).toEqual([{ id: "first" }]);
    expect(view.result.current.canLoadAuxiliaryData).toBe(true);
    await waitFor(() => expect(rowRequests).toHaveLength(3));
    expect(view.result.current.canLoadAuxiliaryData).toBe(true);
    await resolve(2, "first");
    paint();
    expect(view.result.current.canLoadAuxiliaryData).toBe(true);
  }

  it.each(["focus", "reconnect"])(
    "refetches auxiliary data only once after rows settle on %s",
    async (trigger) => {
      const view = renderWired();
      await loadFirstPage(view);
      await act(async () => {
        if (trigger === "focus") {
          focusManager.setFocused(false);
          focusManager.setFocused(true);
        } else {
          onlineManager.setOnline(false);
          onlineManager.setOnline(true);
        }
      });
      await waitFor(() => expect(rowRequests).toHaveLength(2));
      expect(auxCounts()).toEqual([1, 1, 1]);
      await resolve(1, "refetched");
      await waitFor(() => expect(auxCounts()).toEqual([2, 1, 2]));
      expect(view.result.current.canLoadAuxiliaryData).toBe(true);
      focusManager.setFocused(undefined);
    },
  );

  it("does not refetch or re-gate facets, count or strip on sort changes and cached revisits", async () => {
    const view = renderWired();
    await loadFirstPage(view);

    await visitAndReturn(view, {
      orderBy: { column: "startTime", order: "ASC" as const },
    });

    expect(auxCounts()).toEqual([1, 1, 1]);
  });

  it("does not refetch or re-gate facets or strip when paging with the date range pinned", async () => {
    const view = renderWired();
    await loadFirstPage(view);

    await leaveFirstPage(view);
    await visitAndReturn(view, { page: 2 });

    // With select-all, the pin re-keys the paged count: one fetch for the
    // pinned page 2 and one stale refetch on returning to the unpinned page 1
    // key. Facets and strip use the open window and are never refetched.
    expect(calls["events.filterOptions"]).toBe(1);
    expect(calls["dashboard.executeQuery"]).toBe(1);
    expect(calls["events.countAll"]).toBe(3);
  });

  it("refetches auxiliary queries on refresh only after the rows settled", async () => {
    const view = renderWired();
    await loadFirstPage(view);
    const log: string[] = [];
    const invalidator = (key: string) => ({
      invalidate: async () => {
        log.push(key);
        await client.invalidateQueries({ queryKey: [key] });
        if (key === "events.all") log.push("events.all settled");
      },
    });
    const utils = {
      events: {
        all: invalidator("events.all"),
        countAll: invalidator("events.countAll"),
        filterOptions: invalidator("events.filterOptions"),
      },
      dashboard: { executeQuery: invalidator("dashboard.executeQuery") },
    };

    let refreshed = false;
    let refresh!: Promise<void>;
    await act(async () => {
      refresh = refreshEventsTable(utils).then(() => {
        refreshed = true;
      });
    });
    await waitFor(() => expect(rowRequests).toHaveLength(2));
    // Rows are refetching: auxiliary queries are held and not yet invalidated.
    expect(view.result.current.canLoadAuxiliaryData).toBe(false);
    expect(auxCounts()).toEqual([1, 1, 1]);
    expect(refreshed).toBe(false);

    await resolve(1, "first");
    await act(async () => {
      await refresh;
    });
    await waitFor(() => expect(auxCounts()).toEqual([2, 2, 2]));
    // Row invalidation settles before any auxiliary one starts, and all three
    // auxiliary queries are invalidated.
    expect(log.slice(0, 2)).toEqual(["events.all", "events.all settled"]);
    expect(log.slice(2).sort()).toEqual([
      "dashboard.executeQuery",
      "events.countAll",
      "events.filterOptions",
    ]);
  });

  it("re-arms when the unpinned date range re-anchors", async () => {
    const view = renderWired();
    await loadFirstPage(view);

    view.rerender({ range: { from: new Date("2026-01-01T01:00:00.000Z") } });
    expect(view.result.current.canLoadAuxiliaryData).toBe(false);
    expect(auxCounts()).toEqual([1, 1, 1]);

    await waitFor(() => expect(rowRequests).toHaveLength(2));
    await resolve(1, "re-anchored");
    await waitFor(() =>
      expect(view.result.current.observations.rows).toEqual([
        { id: "re-anchored" },
      ]),
    );
    expect(view.result.current.canLoadAuxiliaryData).toBe(false);
    paint();
    expect(view.result.current.canLoadAuxiliaryData).toBe(true);
    await waitFor(() => expect(auxCounts()).toEqual([2, 2, 2]));
  });
});
