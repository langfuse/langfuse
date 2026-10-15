import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode } from "react";
import { AgentsOverview } from "./AgentsOverview";
import { DEFAULT_AGENT_OPTIONS } from "../prototype-options/options";
import { agent, FROM, projection, session, stats, TO } from "./testFixtures";
import { prepareAgents } from "./prepareOverview";

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  zoom: vi.fn(),
  setOptions: vi.fn(),
}));
vi.mock("./useAgentsOverview", () => ({
  useAgentsOverview: () => mocks.state,
}));
vi.mock("../prototype-options", () => ({ PrototypeOptions: () => null }));
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

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.clearAllMocks();
  const data = projection({
    agents: [
      agent("research", {
        current: stats({
          sessions: 7,
          toolInvocations: 21,
          averageSessionDurationMs: 1500,
        }),
      }),
    ],
    sessions: [session("session/a")],
    activity: [
      {
        agentName: "research",
        timestamp: FROM,
        sessions: 1,
        invocations: 2,
        toolInvocations: 3,
        observations: 4,
        skillInvocations: 0,
        cost: 0,
        tokens: 0,
      },
    ],
  });
  mocks.state = {
    options: { ...DEFAULT_AGENT_OPTIONS, showAttention: false },
    setOptions: mocks.setOptions,
    projection: { data, isFetching: false },
    agents: prepareAgents(data, "all", "name"),
    scope: { projectId: "p", from: FROM, to: TO, filter: [] },
    timeRange: { from: FROM, to: TO },
    setTimeRange: vi.fn(),
    queryFilter: {
      explicitFilterState: [],
      searchBarFilterState: [],
      draftResetKey: "scope",
    },
    observedOptions: {},
    environments: { isPending: false },
    setFilters: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
    setStatus: vi.fn(),
    search: "",
    status: "all",
    sort: "name",
    validWindow: true,
    error: false,
    loading: false,
    noSearchResults: false,
    searchTruncated: false,
    refresh: vi.fn(),
    zoom: mocks.zoom,
  };
});
afterEach(() => vi.unstubAllGlobals());

function view(mode: string, extra = {}) {
  mocks.state.options = {
    ...DEFAULT_AGENT_OPTIONS,
    overviewView: mode,
    showAttention: false,
    ...extra,
  };
}

describe("rendered overview modes", () => {
  it("renders the same prepared session metrics and scoped profile navigation as cards and as the shared table", () => {
    const { rerender } = render(<AgentsOverview projectId="p" />);
    expect(screen.getByText("Sessions")).toBeDefined();
    expect(screen.getByText("7")).toBeDefined();
    expect(screen.getByText("Skills used")).toBeDefined();
    const profile = screen
      .getAllByRole("link")
      .find((link) =>
        link.getAttribute("href")?.includes("/agents/research?"),
      )!;
    expect(profile.getAttribute("href")).toContain(
      `dateRange=${FROM.getTime()}-${TO.getTime()}`,
    );
    view("list");
    rerender(<AgentsOverview projectId="p" />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("cell", { name: "7" })).toBeDefined();
    expect(within(table).getByRole("cell", { name: "21" })).toBeDefined();
    expect(
      within(table).getByRole("columnheader", { name: "Skills used" }),
    ).toBeDefined();
  });
  it("makes session drilldown and heatmap zoom real actions while keeping an isolated relationship node navigable", () => {
    view("activity");
    const { rerender } = render(<AgentsOverview projectId="p" />);
    const bar = screen.getByRole("link", { name: "Open session session/a" });
    const url = new URL(bar.getAttribute("href")!, "http://local");
    expect(url.searchParams.get("peek")).toBe("session/a");
    expect(url.searchParams.get("tab")).toBe("sessions");
    view("activity", { activityView: "heatmap" });
    rerender(<AgentsOverview projectId="p" />);
    const bucket = screen.getAllByRole("button", {
      name: /^Zoom research,/,
    })[0];
    fireEvent.click(bucket);
    expect(mocks.zoom).toHaveBeenCalledWith(FROM, expect.any(Date), "research");
    view("relationships");
    rerender(<AgentsOverview projectId="p" />);
    expect(
      screen.getByText(
        "No named-agent call evidence in this window. Isolated agents remain visible.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("img", { name: /Observed calls relationship map/ }),
    ).toBeDefined();
    expect(
      screen
        .getByText("No loaded connections")
        .closest("a")
        ?.getAttribute("href"),
    ).toContain("tab=map");
  });
});
