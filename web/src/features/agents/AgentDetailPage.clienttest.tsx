import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import AgentDetailPage from "./AgentDetailPage";
import { DEFAULT_AGENT_OPTIONS } from "./prototype-options/options";

const mocks = vi.hoisted(() => ({
  route: { projectId: "project", agentName: "research", filter: "" },
  stats: vi.fn(),
  skills: vi.fn(),
  map: vi.fn(),
  table: vi.fn(),
  pulse: vi.fn(),
  push: vi.fn(),
  persistedPicks: vi.fn(),
  paramsUpdates: vi.fn(),
  projection: vi.fn(),
  sessions: vi.fn(),
  initialTab: "runs",
  showAttention: false,
  projectionError: false,
  setWindow: (_window: { from: Date; to: Date }) => {},
}));

const outerWindow = {
  from: new Date("2026-10-08T08:00:00Z"),
  to: new Date("2026-10-08T12:00:00Z"),
};
const innerWindow = {
  from: new Date("2026-10-08T10:00:00Z"),
  to: new Date("2026-10-08T10:30:00Z"),
};

vi.mock("next/router", () => ({
  useRouter: () => ({ query: mocks.route, push: mocks.push }),
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("./AgentsFeatureGate", () => ({
  AgentsFeatureGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/features/feature-flags", () => ({
  InternalFeatureBadge: () => <span>Internal</span>,
}));
vi.mock("@/src/components/table/table-header-controls", () => ({
  TableHeaderControls: ({
    setTimeRange,
  }: {
    setTimeRange: (window: typeof innerWindow) => void;
  }) => (
    <button onClick={() => setTimeRange(innerWindow)}>
      Pick a smaller window
    </button>
  ),
}));
vi.mock("@/src/hooks/useTableDateRange", async () => {
  const { useState } = await import("react");
  return {
    useTableDateRange: () => {
      const [timeRange, setTimeRange] = useState(outerWindow);
      mocks.setWindow = setTimeRange;
      return {
        timeRange,
        setTimeRange: (window: typeof outerWindow) => {
          mocks.persistedPicks(window);
          setTimeRange(window);
        },
      };
    },
  };
});
vi.mock("use-query-params", async () => {
  const { useState } = await import("react");
  return {
    StringParam: {},
    withDefault: () => ({}),
    useQueryParam: () => useState("runs"),
    NumberParam: {},
    useQueryParams: () => {
      const [tab, setTab] = useState(mocks.initialTab);
      return [
        { tab },
        (params: { tab?: string; page?: number; dateRange?: string }) => {
          mocks.paramsUpdates(params);
          if (params.tab) setTab(params.tab);
          if (params.dateRange) {
            const [from, to] = params.dateRange.split("-").map(Number);
            mocks.setWindow({ from: new Date(from), to: new Date(to) });
          }
        },
      ];
    },
  };
});
vi.mock("./AgentStats", () => ({
  AgentStats: (props: unknown) => {
    mocks.stats(props);
    return <span>Stats</span>;
  },
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    agents: {
      sessionProjectionFromEvents: {
        useQuery: (input: unknown) => {
          mocks.projection(input);
          return {
            data: mocks.projectionError
              ? undefined
              : {
                  window: input,
                  coverage: { historyComplete: true },
                  agents: [
                    {
                      agentName: "research",
                      signals: [{ kind: "cost-outlier" }],
                    },
                  ],
                },
            isPending: false,
            isError: mocks.projectionError,
          };
        },
      },
    },
  },
}));
vi.mock("./appearance", () => ({
  AgentIdentity: () => <span>Identity</span>,
  AgentAppearancePicker: () => <span>Appearance</span>,
}));
vi.mock("@/src/features/global-time-range/globalDateRangeStore", () => ({
  useGlobalDateRangeStore: {
    getState: () => ({
      actions: {
        setProjectDefault: (_project: string, encoded: string) => {
          const [from, to] = encoded.split("-").map(Number);
          mocks.persistedPicks({ from: new Date(from), to: new Date(to) });
        },
      },
    }),
  },
}));
vi.mock("./prototype-options", () => ({
  PrototypeOptions: () => <span>Options</span>,
  useAgentsPrototypeOptions: () => ({
    options: {
      ...DEFAULT_AGENT_OPTIONS,
      baselineDays: 14,
      profileChart: "pulse",
      showAttention: mocks.showAttention,
    },
  }),
}));
vi.mock("./profile/AgentCoverage", () => ({
  AgentCoverage: () => <span>Coverage</span>,
}));
vi.mock("./profile/AgentComparison", () => ({
  AgentComparison: ({
    onSelectSignal,
  }: {
    onSelectSignal: (kind: string) => void;
  }) => (
    <button onClick={() => onSelectSignal("cost-outlier")}>
      Inspect cost signal
    </button>
  ),
}));
vi.mock("./profile/AgentToolsContext", () => ({
  AgentToolsContext: () => <span>Tool context</span>,
}));
vi.mock("./AgentSkillsContext", () => ({
  AgentSkillsContext: () => <span>Skill context</span>,
}));
vi.mock("./profile/AgentProfileChart", () => ({
  AgentProfileChart: () => <span>Chart</span>,
}));
vi.mock("./profile/AgentSessions", () => ({
  AgentSessions: (props: unknown) => {
    mocks.sessions(props);
    return <span>Session rows</span>;
  },
}));
vi.mock("./profile/AgentTools", () => ({
  AgentTools: () => <span>Tool rows</span>,
}));
vi.mock("./AgentSkills", () => ({
  AgentSkills: (props: unknown) => {
    mocks.skills(props);
    return <span>Skills data</span>;
  },
}));
vi.mock("./agent-map/AgentMap", () => ({
  AgentMap: (props: { onSelectRuns: (name: string) => void }) => {
    mocks.map(props);
    return (
      <button onClick={() => props.onSelectRuns("compose / β?version=1")}>
        Explore callee runs
      </button>
    );
  },
}));
vi.mock("@/src/features/events/components", () => ({
  ObservationsEventsTable: (props: unknown) => {
    mocks.table(props);
    return <span>Rows</span>;
  },
}));
vi.mock(
  "@/src/features/events/components/outlier-strip/EventsOutlierStrip",
  () => ({
    EventsOutlierStrip: (props: {
      onSelectRange: (window: typeof innerWindow) => void;
    }) => {
      mocks.pulse(props);
      return (
        <button onClick={() => props.onSelectRange(innerWindow)}>
          Zoom into runs
        </button>
      );
    },
  }),
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.filter = "";
  mocks.initialTab = "runs";
  mocks.showAttention = false;
  mocks.projectionError = false;
});

function openDetails() {
  fireEvent.click(screen.getByRole("button", { name: "Agent details" }));
}

async function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("tab", { name }));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name }).getAttribute("data-state")).toBe(
      "active",
    ),
  );
}

test("zoom updates statistics, rows, skills and map to one bounded window", async () => {
  render(<AgentDetailPage />);
  expect(mocks.projection).toHaveBeenLastCalledWith(
    expect.objectContaining(outerWindow),
  );
  openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Zoom into runs" }));
  expect(mocks.projection).toHaveBeenLastCalledWith(
    expect.objectContaining(innerWindow),
  );
  expect(mocks.table).toHaveBeenLastCalledWith(
    expect.objectContaining({
      externalDateRange: innerWindow,
      agentName: "research",
    }),
  );
  expect(mocks.pulse).toHaveBeenLastCalledWith(
    expect.objectContaining({
      fromTimestamp: innerWindow.from,
      toTimestamp: innerWindow.to,
      fixedMetric: "count",
    }),
  );
  await selectTab("Skills");
  expect(mocks.skills).toHaveBeenLastCalledWith(
    expect.objectContaining({
      agentName: "research",
      projection: expect.any(Object),
    }),
  );
  await selectTab("Relationships");
  expect(mocks.map).toHaveBeenLastCalledWith(
    expect.objectContaining(innerWindow),
  );
});

test("environment scope from the agent list applies to every profile surface", async () => {
  const filter: FilterState = [
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: ["staging"],
    },
  ];
  mocks.route.filter = encodeFiltersGeneric(filter);
  render(<AgentDetailPage />);
  openDetails();
  expect(mocks.projection).toHaveBeenLastCalledWith(
    expect.objectContaining({ filter }),
  );
  expect(mocks.table).toHaveBeenLastCalledWith(
    expect.objectContaining({
      externalFilterState: expect.arrayContaining(filter),
    }),
  );
  expect(mocks.pulse).toHaveBeenLastCalledWith(
    expect.objectContaining({ filterState: expect.arrayContaining(filter) }),
  );
  await selectTab("Skills");
  expect(mocks.skills).toHaveBeenLastCalledWith(
    expect.objectContaining({
      agentName: "research",
      projection: expect.any(Object),
    }),
  );
  await selectTab("Relationships");
  expect(mocks.map).toHaveBeenLastCalledWith(
    expect.objectContaining({ filter }),
  );
});

test("edge drilldown encodes the callee as one route segment and preserves the window", async () => {
  render(<AgentDetailPage />);
  openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Zoom into runs" }));
  await selectTab("Relationships");
  fireEvent.click(screen.getByRole("button", { name: "Explore callee runs" }));
  const url = new URL(
    mocks.push.mock.calls[0]?.[0] as string,
    "https://example.test",
  );
  expect(url.pathname).toBe(
    "/project/project/agents/compose%20%2F%20%CE%B2%3Fversion%3D1",
  );
  expect(url.searchParams.get("tab")).toBe("runs");
  expect(url.searchParams.get("dateRange")).toContain(
    String(innerWindow.from.getTime()),
  );
  expect(url.searchParams.get("dateRange")).toContain(
    String(innerWindow.to.getTime()),
  );
});

test("Pulse zoom changes only the URL window and resets pagination", () => {
  render(<AgentDetailPage />);
  openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Zoom into runs" }));
  expect(mocks.persistedPicks).not.toHaveBeenCalled();
  expect(mocks.paramsUpdates).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1 }),
  );
});

test("independent Pulse zoom can recover when bounded profile details fail", () => {
  mocks.projectionError = true;
  render(<AgentDetailPage />);
  expect(screen.getByText("Rows")).toBeInTheDocument();
  openDetails();
  fireEvent.click(screen.getByRole("button", { name: "Zoom into runs" }));
  expect(mocks.projection).toHaveBeenLastCalledWith(
    expect.objectContaining(innerWindow),
  );
  expect(mocks.table).toHaveBeenLastCalledWith(
    expect.objectContaining({ externalDateRange: innerWindow }),
  );
});

test("agent details stay off the data workspace until opened and signal inspection returns to sessions", async () => {
  mocks.initialTab = "sessions";
  mocks.showAttention = true;
  render(<AgentDetailPage />);
  expect(screen.getByText("Session rows")).toBeInTheDocument();
  expect(screen.queryByText("Stats")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Zoom into runs" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agent details" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  openDetails();
  expect(screen.getByText("Stats")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Zoom into runs" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect cost signal" }));
  expect(screen.getByRole("button", { name: "Agent details" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.queryByText("Stats")).not.toBeInTheDocument();
  expect(mocks.paramsUpdates).toHaveBeenLastCalledWith({
    tab: "sessions",
    agentSignal: "cost-outlier",
    agentTool: undefined,
    agentSkill: undefined,
    agentSessionSearch: undefined,
    page: 1,
    peek: undefined,
  });
  openDetails();
  await selectTab("Tools");
  expect(screen.queryByText("Stats")).not.toBeInTheDocument();
  expect(screen.getByText("Tool rows")).toBeInTheDocument();
});

test("changing the profile tab resets the embedded table to its first page", async () => {
  render(<AgentDetailPage />);
  await selectTab("Observations");
  expect(mocks.paramsUpdates).toHaveBeenLastCalledWith({
    tab: "observations",
    page: 1,
    peek: undefined,
  });
});

test("date picker retains intentional default persistence and resets pagination", () => {
  render(<AgentDetailPage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Pick a smaller window" }),
  );
  expect(mocks.persistedPicks).toHaveBeenCalledWith(innerWindow);
  expect(mocks.paramsUpdates).toHaveBeenLastCalledWith({
    page: 1,
    peek: undefined,
    dateRange: `${innerWindow.from.getTime()}-${innerWindow.to.getTime()}`,
  });
});

test("session and invocation tabs retain distinct meanings", async () => {
  mocks.initialTab = "sessions";
  render(<AgentDetailPage />);
  expect(screen.getByRole("tab", { name: "Sessions" })).toHaveAttribute(
    "data-state",
    "active",
  );
  expect(mocks.sessions).toHaveBeenCalled();
  expect(mocks.table).not.toHaveBeenCalled();
  await selectTab("Invocations");
  expect(mocks.table).toHaveBeenLastCalledWith(
    expect.objectContaining({
      externalFilterState: expect.arrayContaining([
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["AGENT"],
        },
      ]),
    }),
  );
});
