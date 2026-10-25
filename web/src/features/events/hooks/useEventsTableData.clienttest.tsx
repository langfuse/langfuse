import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type UseQueryOptions,
  type useQuery,
} from "@tanstack/react-query";
import { type ReactNode } from "react";
import { type TableDataScope } from "@/src/components/table/utils/tablePlaceholder";
import { useEventsTableData } from "./useEventsTableData";

vi.mock("@/src/features/notifications", () => ({
  showSuccessToast: vi.fn(),
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
        queryKey: [name, input],
        queryFn: () => new Promise<never>(() => {}),
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
      },
      annotationQueueItems: { createMany: { useMutation: () => ({}) } },
    },
  };
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

const startTime = new Date("2026-10-01T12:00:00.000Z");

function rowsQueryKey(projectId: string, page: number) {
  return [
    "events.all",
    {
      projectId,
      filter: [],
      searchQuery: null,
      searchType: ["id", "content"],
      orderBy: null,
      page,
      limit: 50,
    },
  ];
}

function batchIOQueryKey(projectId: string, ids: string[]) {
  return [
    "events.batchIO",
    {
      projectId,
      observations: ids.map((id) => ({ id, traceId: `trace-${id}` })),
      minStartTime: startTime,
      maxStartTime: startTime,
    },
  ];
}

function cacheRows(
  client: QueryClient,
  projectId: string,
  page: number,
  ids: string[],
) {
  client.setQueryData(rowsQueryKey(projectId, page), {
    observations: ids.map((id) => ({ id, traceId: `trace-${id}`, startTime })),
    hasMore: true,
  });
}

function renderTableData(client: QueryClient) {
  return renderHook(
    ({ projectId, page }: { projectId: string; page: number }) =>
      useEventsTableData({
        projectId,
        filterState: [],
        tableDataScope: {
          projectId,
          filter: [],
          timeRange: { range: "last1Day" },
        },
        paginationState: { page, limit: 50 },
        orderByState: null,
        selectedRows: {},
        selectAll: false,
        setSelectedRows: () => {},
      }),
    {
      initialProps: { projectId: "project-a", page: 1 },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}

it("fills metadata from delayed batch I/O by observation id", async () => {
  const client = new QueryClient();
  cacheRows(client, "project-a", 1, ["first", "second"]);
  const { result, unmount } = renderTableData(client);

  expect(result.current.observations.status).toBe("success");
  expect(result.current.observations.rows?.map((row) => row.metadata)).toEqual([
    undefined,
    undefined,
  ]);
  expect(result.current.isIoPending("first")).toBe(true);

  const metadata = JSON.stringify({
    repo: "langfuse",
    count: 0,
    enabled: false,
  });
  act(() => {
    client.setQueryData(batchIOQueryKey("project-a", ["first", "second"]), [
      { id: "second", input: null, output: null, metadata: null },
      { id: "first", input: null, output: null, metadata },
    ]);
  });

  await waitFor(() => {
    expect(
      result.current.observations.rows?.map((row) => row.metadata),
    ).toEqual([metadata, null]);
    expect(result.current.isIoPending("first")).toBe(false);
  });

  unmount();
  client.clear();
});

it("does not carry metadata across projects with the same observation id", async () => {
  const client = new QueryClient();
  const oldMetadata = JSON.stringify({ repo: "project-a-repo" });
  const newMetadata = JSON.stringify({ repo: "project-b-repo" });
  cacheRows(client, "project-a", 1, ["shared-id"]);
  client.setQueryData(batchIOQueryKey("project-a", ["shared-id"]), [
    { id: "shared-id", input: null, output: null, metadata: oldMetadata },
  ]);
  const { result, rerender, unmount } = renderTableData(client);
  expect(result.current.observations.rows?.[0]?.metadata).toBe(oldMetadata);

  rerender({ projectId: "project-b", page: 1 });
  expect(result.current.observations.status).toBe("loading");
  expect(result.current.observations.rows).toBeUndefined();

  act(() => cacheRows(client, "project-b", 1, ["shared-id"]));
  await waitFor(() => {
    expect(result.current.observations.rows?.[0]?.id).toBe("shared-id");
    expect(result.current.observations.rows?.[0]?.metadata).toBeUndefined();
    expect(result.current.isIoPending("shared-id")).toBe(true);
  });

  act(() => {
    client.setQueryData(batchIOQueryKey("project-b", ["shared-id"]), [
      { id: "shared-id", input: null, output: null, metadata: newMetadata },
    ]);
  });
  await waitFor(() => {
    expect(result.current.observations.rows?.[0]?.metadata).toBe(newMetadata);
  });

  unmount();
  client.clear();
});

it("keeps the current page metadata while loading and clears it for new rows", async () => {
  const client = new QueryClient();
  const firstMetadata = JSON.stringify({ branch: "main" });
  const secondMetadata = JSON.stringify({ branch: "release" });
  cacheRows(client, "project-a", 1, ["first"]);
  client.setQueryData(batchIOQueryKey("project-a", ["first"]), [
    { id: "first", input: null, output: null, metadata: firstMetadata },
  ]);
  const { result, rerender, unmount } = renderTableData(client);

  rerender({ projectId: "project-a", page: 2 });
  expect(result.current.observations.rows?.[0]?.id).toBe("first");
  expect(result.current.observations.rows?.[0]?.metadata).toBe(firstMetadata);

  act(() => cacheRows(client, "project-a", 2, ["second"]));
  await waitFor(() => {
    expect(result.current.observations.rows?.[0]?.id).toBe("second");
    expect(result.current.observations.rows?.[0]?.metadata).toBeUndefined();
    expect(result.current.isIoPending("second")).toBe(true);
  });

  act(() => {
    client.setQueryData(batchIOQueryKey("project-a", ["second"]), [
      { id: "second", input: null, output: null, metadata: secondMetadata },
    ]);
  });
  await waitFor(() => {
    expect(result.current.observations.rows?.[0]?.metadata).toBe(
      secondMetadata,
    );
    expect(result.current.isIoPending("second")).toBe(false);
  });

  unmount();
  client.clear();
});
