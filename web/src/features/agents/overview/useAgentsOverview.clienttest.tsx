import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { type ReactNode } from "react";
import {
  type AgentListResult,
  type AgentSessionProjection,
  type FilterState,
} from "@langfuse/shared";
import { useAgentsOverview } from "./useAgentsOverview";
import { resolveAgentOptions } from "../prototype-options/options";
import { agent, FROM, projection, TO } from "./testFixtures";

const mocks = vi.hoisted(() => ({
  project: vi.fn<(input: unknown) => Promise<AgentSessionProjection>>(),
  list: vi.fn<(input: unknown) => Promise<AgentListResult>>(),
  query: {} as Record<string, string | undefined>,
  setQuery: vi.fn(),
  timeRange: {
    from: new Date("2026-10-14T16:00:00Z"),
    to: new Date("2026-10-14T20:00:00Z"),
  },
  filter: [] as FilterState,
}));
vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParams: () => [mocks.query, mocks.setQuery],
}));
vi.mock("@/src/hooks/useTableDateRange", () => ({
  useTableDateRange: () => ({
    timeRange: mocks.timeRange,
    setTimeRange: vi.fn(),
  }),
}));
vi.mock("@/src/features/filters", () => ({
  buildSidebarFilterSessionContextId: () => "p",
  useSidebarFilterState: () => ({
    effectiveFilterState: mocks.filter,
    explicitFilterState: mocks.filter,
    searchBarFilterState: mocks.filter,
    setFilterState: vi.fn(),
  }),
}));
vi.mock("../prototype-options", () => ({
  useAgentsPrototypeOptions: () => ({
    options: resolveAgentOptions(mocks.query),
    setOptions: vi.fn(),
    resetOptions: vi.fn(),
  }),
}));
type Options = { enabled: boolean };
vi.mock("@/src/utils/api", () => ({
  api: {
    projects: {
      environmentFilterOptions: {
        useQuery: () => ({ data: [], isPending: false }),
      },
    },
    agents: {
      sessionProjectionFromEvents: {
        useQuery: (input: unknown, options: Options) =>
          useQuery({
            queryKey: ["projection", input],
            queryFn: () => mocks.project(input),
            ...options,
          }),
      },
      allFromEvents: {
        useQuery: (input: unknown, options: Options) =>
          useQuery({
            queryKey: ["search", input],
            queryFn: () => mocks.list(input),
            ...options,
          }),
      },
    },
  },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useAgentsOverview("p"), { wrapper }), client };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = {};
  mocks.filter = [];
  mocks.timeRange = { from: FROM, to: TO };
  mocks.project.mockResolvedValue(projection());
  mocks.list.mockResolvedValue({
    totalAgents: 1,
    agents: [{ agentName: "rare-name", totalTraces: 1n }],
  });
});

describe("overview scope controller", () => {
  it("shares one closed date/environment scope, and never overlays previous-scope summaries", async () => {
    const first = projection({ agents: [agent("production")] });
    mocks.project.mockResolvedValueOnce(first);
    const { result, rerender, unmount, client } = setup();
    await waitFor(() =>
      expect(result.current.agents[0]?.agentName).toBe("production"),
    );
    expect(mocks.project).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projectId: "p",
        from: FROM,
        to: TO,
        filter: [],
        baselineDays: 14,
      }),
    );
    const pending = deferred<AgentSessionProjection>();
    mocks.project.mockReturnValueOnce(pending.promise);
    mocks.filter = [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["staging"],
      },
    ];
    rerender();
    expect(result.current.loading).toBe(true);
    expect(result.current.agents).toEqual([]);
    pending.resolve(projection({ agents: [agent("staging")] }));
    await waitFor(() =>
      expect(result.current.agents[0]?.agentName).toBe("staging"),
    );
    expect(mocks.project).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: mocks.filter, from: FROM, to: TO }),
    );
    unmount();
    client.clear();
  });
  it("resolves name search in the full discovery lookback before fetching matching agents", async () => {
    mocks.query.search = "rare";
    const { result, unmount, client } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        from: new Date(TO.getTime() - 30 * 86_400_000),
        to: TO,
        searchQuery: "rare",
        page: 0,
        limit: 25,
      }),
    );
    expect(mocks.project).toHaveBeenCalledTimes(1);
    expect(mocks.project).toHaveBeenCalledWith(
      expect.objectContaining({
        agentNames: ["rare-name"],
        from: FROM,
        to: TO,
      }),
    );
    unmount();
    client.clear();
  });
  it("does not issue an empty-name projection or fall back to unfiltered results for no matches", async () => {
    mocks.query.search = "absent";
    mocks.list.mockResolvedValue({ totalAgents: 0, agents: [] });
    const { result, unmount, client } = setup();
    await waitFor(() => expect(result.current.noSearchResults).toBe(true));
    expect(result.current.agents).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mocks.project).not.toHaveBeenCalled();
    await result.current.refresh();
    expect(mocks.project).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });
  it("preserves effective shared options in navigation scope without sending them to aggregation requests", async () => {
    mocks.query.agentBaseline = "7";
    mocks.query.agentChart = "none";
    const { result, unmount, client } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.scope).toHaveProperty(
      "prototypeOptions",
      expect.objectContaining({ baselineDays: 7, profileChart: "none" }),
    );
    expect(mocks.project).toHaveBeenCalledWith(
      expect.objectContaining({ baselineDays: 7 }),
    );
    expect(mocks.project.mock.calls[0][0]).not.toHaveProperty(
      "prototypeOptions",
    );
    unmount();
    client.clear();
  });

  it("pushes a zoom as URL state without persisting a new global default", async () => {
    const { result, unmount, client } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));
    const end = new Date(FROM.getTime() + 60_000);
    result.current.zoom(FROM, end, "research/é");
    expect(mocks.setQuery).toHaveBeenLastCalledWith(
      { dateRange: `${FROM.getTime()}-${end.getTime()}`, search: "research/é" },
      "pushIn",
    );
    unmount();
    client.clear();
  });
});
