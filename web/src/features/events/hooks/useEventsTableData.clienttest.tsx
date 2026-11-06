import { renderHook } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  type UseQueryOptions,
  type useQuery,
} from "@tanstack/react-query";
import { type ReactNode } from "react";
import { type AgentTraceScope } from "@langfuse/shared/agents";
import { type TableDataScope } from "@/src/components/table/utils/tablePlaceholder";
import { useEventsTableData } from "./useEventsTableData";

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
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

it("keeps agent membership on row and count queries and drops rows on an agent switch", () => {
  const client = new QueryClient();
  const agentScope: AgentTraceScope = {
    mode: "traces",
    identity: { kind: "id", value: "agent-a" },
    from: new Date("2026-11-01T00:00:00Z"),
    to: new Date("2026-11-02T00:00:00Z"),
    environment: "production",
  };
  const payload = {
    projectId: "project-a",
    agentScope,
    filter: [],
    searchQuery: null,
    searchType: ["id", "content"],
    orderBy: null,
  };
  client.setQueryData(["events.all", { ...payload, page: 1, limit: 50 }], {
    observations: [{ id: "agent-a-row" }],
    hasMore: false,
  });
  client.setQueryData(["events.countAll", payload], {
    totalCount: 1,
    uniqueTraceCount: 1,
  });
  const { result, rerender, unmount } = renderHook(
    ({ membership }: { membership: AgentTraceScope }) =>
      useEventsTableData({
        projectId: payload.projectId,
        agentScope: membership,
        filterState: [],
        tableDataScope: {
          projectId: payload.projectId,
          agentScope: membership,
          filter: [],
          timeRange: { from: membership.from, to: membership.to },
        },
        paginationState: { page: 1, limit: 50 },
        orderByState: null,
        selectedRows: {},
        selectAll: true,
        setSelectedRows: () => {},
      }),
    {
      initialProps: { membership: agentScope },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  expect(result.current.observations.rows).toEqual([{ id: "agent-a-row" }]);
  expect(result.current.totalCount).toBe(1);

  for (const change of [
    { identity: { kind: "id" as const, value: "agent-b" } },
    { mode: "tools" as const },
    { mode: "invocations" as const },
    { environment: "development" },
  ]) {
    rerender({ membership: { ...agentScope, ...change } });
    expect(result.current.observations.status).toBe("loading");
    expect(result.current.observations.rows).toBeUndefined();
    expect(result.current.totalCount).toBeNull();
  }

  unmount();
  client.clear();
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
