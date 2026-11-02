import { renderHook } from "@testing-library/react";
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
