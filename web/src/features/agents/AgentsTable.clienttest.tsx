import { act, render, screen, waitFor, within } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type keepPreviousData,
} from "@tanstack/react-query";
import { type ReactNode } from "react";
import {
  type AgentListResult,
  type AgentMetrics,
  type FilterState,
} from "@langfuse/shared";
import { AgentsTable } from "./AgentsTable";

const mocks = vi.hoisted(() => ({
  list: vi.fn<(input: unknown) => Promise<AgentListResult>>(),
  metrics: vi.fn<(input: unknown) => Promise<AgentMetrics[]>>(),
  filter: [] as FilterState,
  timeRange: {
    from: new Date("2026-10-08T08:00:00Z"),
    to: new Date("2026-10-08T12:00:00Z"),
  },
  search: null as string | null,
  pageIndex: 0,
}));

type QueryOptions = {
  enabled: boolean;
  placeholderData: typeof keepPreviousData;
};
vi.mock("@/src/utils/api", () => ({
  api: {
    projects: {
      environmentFilterOptions: {
        useQuery: () => ({ data: [], isPending: false }),
      },
    },
    agents: {
      allFromEvents: {
        useQuery: (input: unknown, options: QueryOptions) =>
          useQuery({
            queryKey: ["agents", input],
            queryFn: () => mocks.list(input),
            ...options,
          }),
      },
      metricsFromEvents: {
        useQuery: (input: unknown, options: QueryOptions) =>
          useQuery({
            queryKey: ["metrics", input],
            queryFn: () => mocks.metrics(input),
            ...options,
          }),
      },
    },
  },
}));
vi.mock("use-query-params", () => ({
  NumberParam: {},
  StringParam: {},
  withDefault: () => ({}),
  useQueryParams: () => [{ pageIndex: mocks.pageIndex, pageSize: 20 }, vi.fn()],
  useQueryParam: () => [mocks.search, vi.fn()],
}));
vi.mock("@/src/hooks/useTableDateRange", () => ({
  useTableDateRange: () => ({
    timeRange: mocks.timeRange,
    setTimeRange: vi.fn(),
  }),
}));
vi.mock("@/src/features/filters", () => ({
  buildSidebarFilterSessionContextId: () => "project",
  useSidebarFilterState: () => ({
    effectiveFilterState: mocks.filter,
    explicitFilterState: mocks.filter,
    searchBarFilterState: mocks.filter,
    draftResetKey: "scope",
    setFilterState: vi.fn(),
  }),
}));
vi.mock("@/src/components/table/data-table-controls", () => ({
  DataTableControlsProvider: ({ children }: { children: ReactNode }) =>
    children,
  DataTableControls: () => null,
}));
vi.mock("@/src/components/table/resizable-filter-layout", () => ({
  ResizableFilterLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/components/table/FilterToggleButton", () => ({
  FilterToggleButton: () => null,
}));
vi.mock("@/src/components/table/table-header-controls", () => ({
  TableHeaderControls: () => null,
}));
vi.mock("@/src/features/search-bar", () => ({
  TableSearchBar: () => null,
  toObservedOptions: () => ({}),
}));
vi.mock("@/src/components/layouts/doc-popup", () => ({ default: () => null }));
vi.mock("@/src/components/design-system/PaginationBar/PaginationBar", () => ({
  PaginationBar: () => null,
}));

const initialMetric: AgentMetrics = {
  agentName: "agentique",
  firstSeen: new Date("2026-10-08T08:00:00Z"),
  lastSeen: new Date("2026-10-08T11:00:00Z"),
  totalTraces: 20n,
  totalObservations: 40n,
  totalRuns: 20n,
  totalPromptTokens: 100n,
  totalCompletionTokens: 100n,
  totalTokens: 200n,
  sumCalculatedTotalCost: 12,
  averageCostPerTrace: 0.6,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filter = [];
  mocks.timeRange = {
    from: new Date("2026-10-08T08:00:00Z"),
    to: new Date("2026-10-08T12:00:00Z"),
  };
  mocks.search = null;
  mocks.pageIndex = 0;
});

test.each(["date", "environment", "search", "page"] as const)(
  "keeps list rows but loads scoped metrics after a %s change",
  async (change) => {
    const nextList = deferred<AgentListResult>();
    const nextMetrics = deferred<AgentMetrics[]>();
    mocks.list
      .mockResolvedValueOnce({
        totalAgents: 1,
        agents: [{ agentName: "agentique", totalTraces: 20n }],
      })
      .mockReturnValueOnce(nextList.promise);
    mocks.metrics
      .mockResolvedValueOnce([initialMetric])
      .mockReturnValueOnce(nextMetrics.promise);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const view = (
      <QueryClientProvider client={client}>
        <AgentsTable projectId="project" />
      </QueryClientProvider>
    );
    const { rerender, unmount } = render(view);
    const cells = () =>
      within(screen.getByRole("table", { name: "Agents" }))
        .getAllByRole("row")[1]!
        .querySelectorAll("td");

    await waitFor(() => expect(cells()[5]).toHaveTextContent("$12.00"));
    const nextName =
      change === "search" || change === "page" ? "research" : "agentique";
    if (change === "date")
      mocks.timeRange = {
        from: new Date("2026-10-08T10:00:00Z"),
        to: new Date("2026-10-08T11:00:00Z"),
      };
    if (change === "environment")
      mocks.filter = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["staging"],
        },
      ];
    if (change === "search") mocks.search = "research";
    if (change === "page") mocks.pageIndex = 1;
    rerender(
      <QueryClientProvider client={client}>
        <AgentsTable projectId="project" />
      </QueryClientProvider>,
    );

    // The previous list remains usable while the next page is in flight.
    expect(cells()[0]).toHaveTextContent("agentique");
    expect(cells()[1]).toHaveTextContent("20");
    await act(async () =>
      nextList.resolve({
        totalAgents: 1,
        agents: [{ agentName: nextName, totalTraces: 5n }],
      }),
    );
    await waitFor(() => expect(mocks.metrics).toHaveBeenCalledTimes(2));
    expect(cells()[0]).toHaveTextContent(nextName);
    expect(cells()[1]).toHaveTextContent("5");
    for (const cell of Array.from(cells()).slice(2)) {
      expect(cell.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    }

    await act(async () =>
      nextMetrics.resolve([
        {
          ...initialMetric,
          agentName: nextName,
          totalTraces: 6n,
          totalObservations: 12n,
          totalRuns: 6n,
          sumCalculatedTotalCost: 0.25,
        },
      ]),
    );
    await waitFor(() => expect(cells()[5]).toHaveTextContent("$0.25"));
    expect(cells()[1]).toHaveTextContent("5");
    expect(cells()[2]).toHaveTextContent("12");
    unmount();
    client.clear();
  },
);
