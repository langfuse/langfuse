import type { ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";
import { rangeToString, type TimeRange } from "@/src/utils/date-range-utils";
import { type TopicFacet } from "@langfuse/shared/topics";

const state = vi.hoisted(() => ({
  canViewTopics: true,
  status: "failed",
  executionUpdatedAt: 110,
  updatedAt: "2026-09-23T12:00:00Z",
  retry: vi.fn(),
  refetchExecution: vi.fn(),
  dateRange: undefined as string | undefined,
  executionId: undefined as string | undefined,
  setQueryParams: vi.fn(),
  currentTopics: vi.fn(),
  showGenerateCTA: false,
  hasStoredSummaries: true,
  resultsDataAvailable: true,
  mobileHeader: false,
  resultFacets: [] as Array<{ facetId: string; name: string }>,
  openAutomaticProcessing: vi.fn(),
  picker: vi.fn(),
  push: vi.fn(),
  openConfigure: vi.fn(),
  canWrite: true,
  facets: [] as TopicFacet[],
  facetsLoading: false,
  executions: [] as unknown[] | undefined,
  executionsError: null as Error | null,
  rulesPending: false,
  rulesError: null as Error | null,
  configurationFailure: null as "settings" | "readiness" | "connections" | null,
  settings: {} as Record<string, unknown>,
  rules: [] as Array<{ facetIds: string[] }>,
  countsPending: false,
  countsFetching: false,
  summaryCountInput: vi.fn(),
  invalidateSummaryCounts: vi.fn(),
  counts: [] as Array<{ facetId: string; facetVersion: number; count: number }>,
  trigger: vi.fn(),
}));

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: () => [undefined, vi.fn()],
  useQueryParams: () => [{ dateRange: state.dateRange }, state.setQueryParams],
}));
vi.mock("@/src/components/layouts/page-header-controls-slot", () => ({
  PageHeaderControlsPortal: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/components/date-picker", () => ({
  TimeRangePicker: (props: {
    timeRange: TimeRange;
    onTimeRangeChange: (range: TimeRange) => void;
  }) => {
    state.picker(props.timeRange);
    return (
      <>
        <button
          onClick={() => props.onTimeRangeChange({ range: "last30Days" })}
        >
          Select last 30 days
        </button>
        <button
          onClick={() =>
            props.onTimeRangeChange({
              from: new Date("2026-10-01T00:00:00Z"),
              to: new Date("2026-10-08T00:00:00Z"),
            })
          }
        >
          Select custom dates
        </button>
      </>
    );
  },
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project", executionId: state.executionId },
    push: state.push,
  }),
}));
vi.mock("@/src/components/layouts/Page", () => ({
  default: ({
    children,
    headerProps,
  }: {
    children: ReactNode;
    headerProps?: {
      actionButtonsRight?: ReactNode;
      actionButtonsMenu?: (controls: { closeMenu: () => void }) => ReactNode;
    };
  }) => (
    <>
      {state.mobileHeader
        ? headerProps?.actionButtonsMenu?.({ closeMenu: vi.fn() })
        : headerProps?.actionButtonsRight}
      {children}
    </>
  ),
}));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({}),
}));
vi.mock("@/src/components/table/peek/TablePeekViewTraceDetail", () => ({
  TablePeekViewTraceDetail: () => null,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => state.canWrite,
}));
vi.mock("@/src/components/error-page", () => ({
  ErrorPage: ({ message }: { message: string }) => <p>{message}</p>,
}));
vi.mock("@/src/features/topics/topicsAccess", () => ({
  useCanViewTopics: () => state.canViewTopics,
}));
vi.mock("./TopicTraceSelector", () => ({
  useTopicTraceSelector: () => ({
    selection: {
      count: 2,
      selection: {
        filter: [],
        from: new Date("2026-10-01T00:00:00Z"),
        to: new Date("2026-10-09T12:00:00Z"),
        limit: 2,
        sampling: "random",
        seed: "frozen-preview",
        excludedTraceIds: ["excluded-trace"],
      },
    },
    controls: <div>Trace selection</div>,
    reset: vi.fn(),
  }),
}));
vi.mock("./ConfigureTopicsDialogController", () => ({
  ConfigureTopicsDialogController: ({
    children,
  }: {
    children: (control: { openDialog: () => void }) => ReactNode;
  }) => children({ openDialog: state.openConfigure }),
}));
vi.mock("./TopicSetupFlowController", () => ({
  TopicSetupFlowController: ({
    children,
  }: {
    children: (control: { openSetup: () => void }) => ReactNode;
  }) => children({ openSetup: () => {} }),
}));
vi.mock("./AutomaticProcessingDialogController", () => ({
  AutomaticProcessingDialogController: ({
    children,
  }: {
    children: (control: { openDialog: () => void }) => ReactNode;
  }) => children({ openDialog: state.openAutomaticProcessing }),
}));
vi.mock("./CurrentTopics", () => ({
  useCurrentTopics: (input: {
    running: boolean;
    refreshAfter: number;
    timeRange: { from: Date; to: Date };
  }) => {
    state.currentTopics(input);
    return {
      ...input,
      data: state.resultsDataAvailable
        ? {
            hasStoredSummaries: state.hasStoredSummaries,
            facets: state.resultFacets,
          }
        : undefined,
      isLoading: false,
    };
  },
  CurrentTopics: ({
    result,
    onGenerateTopics,
  }: {
    result: { running: boolean; refreshAfter: number };
    onGenerateTopics: () => void;
  }) => (
    <div
      data-testid="current-topics"
      data-running={result.running}
      data-refresh-after={result.refreshAfter}
    >
      {state.showGenerateCTA && (
        <button onClick={onGenerateTopics}>Generate topics</button>
      )}
    </div>
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      facets: {
        useQuery: () => ({
          data: state.facetsLoading ? undefined : state.facets,
          isLoading: state.facetsLoading,
          isSuccess: !state.facetsLoading,
        }),
      },
      executions: {
        useQuery: () => ({
          data: state.executions,
          error: state.executionsError,
        }),
      },
      modelSettings: {
        useQuery: () => ({
          isPending: false,
          data:
            state.configurationFailure === "settings"
              ? undefined
              : state.settings,
          error:
            state.configurationFailure === "settings"
              ? new Error("Configuration unavailable.")
              : null,
        }),
      },
      tracingReadinessSettings: {
        useQuery: () => ({
          data:
            state.configurationFailure === "readiness"
              ? undefined
              : { traceIdleMs: 600_000 },
          error:
            state.configurationFailure === "readiness"
              ? new Error("Configuration unavailable.")
              : null,
        }),
      },
      setAutomaticProcessing: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
        }),
      },
      rules: {
        useQuery: () => ({
          data: state.rulesPending ? undefined : state.rules,
          isPending: state.rulesPending,
          isSuccess: !state.rulesPending && !state.rulesError,
          error: state.rulesError,
        }),
      },
      summaryCounts: {
        useQuery: (input: unknown) => {
          state.summaryCountInput(input);
          return typeof input === "symbol"
            ? { isPending: true }
            : {
                isPending: state.countsPending,
                isFetching: state.countsFetching,
                data: state.countsPending ? undefined : state.counts,
              };
        },
      },
      trigger: {
        useMutation: () => ({ mutateAsync: state.trigger, isPending: false }),
      },
      execution: {
        useQuery: () => ({
          data: {
            id: "execution",
            status: state.status,
            phase: state.status === "queued" ? "queued" : "summarizing",
            createdAt: "2026-09-23T12:00:00Z",
            updatedAt: state.updatedAt,
            input: {
              operation: "process",
              embeddingConfig: { embeddingDimensions: 1024 },
            },
            facets: [],
            error: null,
          },
          dataUpdatedAt: state.executionUpdatedAt,
          refetch: state.refetchExecution,
        }),
      },
      traceErrors: { useQuery: () => ({}) },
      retry: {
        useMutation: ({ onSuccess }: { onSuccess: () => void }) => ({
          mutate: (input: unknown) => {
            state.retry(input);
            state.status = "queued";
            state.executionUpdatedAt = 120;
            onSuccess();
          },
        }),
      },
    },
    llmApiKey: {
      effective: {
        useQuery: () => ({
          data:
            state.configurationFailure === "connections"
              ? undefined
              : { data: [] },
          error:
            state.configurationFailure === "connections"
              ? new Error("Configuration unavailable.")
              : null,
        }),
      },
    },
    useUtils: () => ({
      topics: {
        modelSettings: { invalidate: vi.fn() },
        rules: { invalidate: vi.fn() },
        executions: { invalidate: vi.fn() },
        summaryCounts: { invalidate: state.invalidateSummaryCounts },
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.showGenerateCTA = false;
  state.canViewTopics = true;
  state.resultsDataAvailable = true;
  state.mobileHeader = false;
  state.resultFacets = [];
  state.hasStoredSummaries = true;
  state.status = "failed";
  state.executionUpdatedAt = 110;
  state.updatedAt = "2026-09-23T12:00:00Z";
  state.dateRange = undefined;
  state.executionId = undefined;
  state.canWrite = true;
  state.facets = [];
  state.facetsLoading = false;
  state.executions = [];
  state.executionsError = null;
  state.rulesPending = false;
  state.rulesError = null;
  state.configurationFailure = null;
  state.settings = {
    summary: { model: "summary" },
    embedding: { model: "embedding" },
    embeddingDimensions: 1024,
    clustering: { model: "clustering" },
    blockedAt: null,
    blockMessage: null,
  };
  state.rules = [];
  state.counts = [];
  state.countsPending = false;
  state.countsFetching = false;
  state.trigger.mockReset().mockResolvedValue({ id: "regenerated" });
  state.setQueryParams.mockImplementation(
    ({ dateRange }: { dateRange: string }) => {
      state.dateRange = dateRange;
    },
  );
  useGlobalDateRangeStore.persist.setOptions({
    storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
  });
  useGlobalDateRangeStore.setState({ defaultsByProject: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shows Not found instead of the workspace when the Topics gate is closed", () => {
  state.canViewTopics = false;
  render(<TopicsPage />, { wrapper: LayerProvider });
  expect(screen.getByText("This page is not available.")).toBeTruthy();
  expect(state.currentTopics).not.toHaveBeenCalled();
});

it("keeps facet, view, and automatic processing reachable with the mobile header", () => {
  state.mobileHeader = true;
  state.resultFacets = [{ facetId: "intent", name: "Intent" }];
  state.rules = [{ facetIds: ["intent"] }];
  const view = render(<TopicsPage />);
  expect(screen.getByRole("combobox", { name: "Topics facet" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Topics view" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^Analyze/ }));
  expect(state.openAutomaticProcessing).toHaveBeenCalledWith(false);
  state.canWrite = false;
  view.rerender(<TopicsPage />);
  expect(
    screen.getByRole("button", { name: /^Analyze/ }).hasAttribute("disabled"),
  ).toBe(true);
});

it.each([
  ["30d", 30 * 24 * 60],
  ["5m", 5],
  ["6h", 6 * 60],
])(
  "uses the shared project range %s for results and processing",
  (token, minutes) => {
    useGlobalDateRangeStore
      .getState()
      .actions.setProjectDefault("project", token);
    render(<TopicsPage />, { wrapper: LayerProvider });
    const { timeRange } = state.currentTopics.mock.lastCall![0];
    expect(timeRange.to.getTime() - timeRange.from.getTime()).toBe(
      minutes * 60_000,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select last 30 days" }),
    );
    expect(state.dateRange).toBe("30d");
    expect(useGlobalDateRangeStore.getState().defaultsByProject.project).toBe(
      "30d",
    );
  },
);

it("keeps a URL custom range fixed when an execution completes", () => {
  const timeRange = {
    from: new Date("2026-09-01T12:34:00Z"),
    to: new Date("2026-09-02T15:45:00Z"),
  };
  state.dateRange = rangeToString(timeRange);
  state.status = "running";
  const view = render(<TopicsPage />, { wrapper: LayerProvider });
  expect(state.currentTopics).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange }),
  );

  state.status = "completed";
  view.rerender(<TopicsPage />);
  expect(state.currentTopics).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange }),
  );
});

it.each(["stored", "URL"])(
  "caps an inherited one-year %s range without changing the shared selection",
  (source) => {
    useGlobalDateRangeStore
      .getState()
      .actions.setProjectDefault("project", "1y");
    state.dateRange = source === "URL" ? "1y" : undefined;
    render(<TopicsPage />, { wrapper: LayerProvider });

    const { timeRange } = state.currentTopics.mock.lastCall![0];
    expect(timeRange).toEqual({
      from: new Date(Date.now() - 90 * 86_400_000),
      to: new Date(),
    });
    expect(state.picker).toHaveBeenLastCalledWith({ range: "last90Days" });
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
      "Your selection is preserved on other pages.",
    );
    expect(state.setQueryParams).not.toHaveBeenCalled();
    expect(state.dateRange).toBe(source === "URL" ? "1y" : undefined);
    expect(useGlobalDateRangeStore.getState().defaultsByProject.project).toBe(
      "1y",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select last 30 days" }),
    );
    expect(state.dateRange).toBe("30d");
    expect(useGlobalDateRangeStore.getState().defaultsByProject.project).toBe(
      "30d",
    );
    expect(state.picker).toHaveBeenLastCalledWith({ range: "last30Days" });
    expect(screen.queryByRole("status", { name: "" })).not.toBeInTheDocument();
  },
);

it("caps a custom range at its original end and preserves its URL through completion", () => {
  const requested = {
    from: new Date("2026-03-01T12:34:00Z"),
    to: new Date("2026-09-02T15:45:00Z"),
  };
  const expected = {
    from: new Date(requested.to.getTime() - 90 * 86_400_000),
    to: requested.to,
  };
  state.dateRange = rangeToString(requested);
  state.status = "running";
  const view = render(<TopicsPage />, { wrapper: LayerProvider });
  expect(state.currentTopics).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange: expected }),
  );
  expect(state.picker).toHaveBeenLastCalledWith(expected);
  expect(screen.getByRole("status", { name: "" })).toHaveTextContent(
    "final 90 days of your selected range",
  );

  state.status = "completed";
  view.rerender(<TopicsPage />);
  expect(state.currentTopics).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange: expected }),
  );
  expect(state.setQueryParams).not.toHaveBeenCalled();
  expect(state.dateRange).toBe(rangeToString(requested));
  expect(useGlobalDateRangeStore.getState().defaultsByProject).toEqual({});
});

it.each([
  { range: "last90Days" },
  {
    from: new Date("2026-04-01T15:45:00Z"),
    to: new Date(new Date("2026-04-01T15:45:00Z").getTime() + 90 * 86_400_000),
  },
] satisfies TimeRange[])(
  "leaves an exact 90-day range unchanged: %j",
  (timeRange) => {
    state.dateRange = rangeToString(timeRange);
    render(<TopicsPage />, { wrapper: LayerProvider });
    expect(state.picker).toHaveBeenLastCalledWith(timeRange);
    expect(screen.queryByRole("status", { name: "" })).not.toBeInTheDocument();
    expect(state.setQueryParams).not.toHaveBeenCalled();
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
  },
);

it("refreshes current results through retry and completion for a selected run outside history", () => {
  state.executionId = "execution";
  const view = render(<TopicsPage />, { wrapper: LayerProvider });
  const status = screen.getByRole("dialog", { name: "Analyze traces" });
  fireEvent.click(within(status).getByRole("button", { name: "Resume run" }));
  expect(state.retry).toHaveBeenCalledWith({
    projectId: "project",
    executionId: "execution",
  });
  expect(state.refetchExecution).toHaveBeenCalledOnce();
  view.rerender(<TopicsPage />);
  expect(within(status).getByRole("status")).toHaveTextContent(
    "Waiting for a worker",
  );
  const current = screen.getByTestId("current-topics");
  expect(current).toHaveAttribute("data-running", "true");
  expect(current).toHaveAttribute("data-refresh-after", "0");

  state.status = "completed";
  state.updatedAt = "2026-09-23T12:01:00Z";
  state.executionUpdatedAt = 130;
  view.rerender(<TopicsPage />);
  expect(current).toHaveAttribute("data-running", "false");
  const completedAt = String(new Date(state.updatedAt).getTime());
  expect(current).toHaveAttribute("data-refresh-after", completedAt);

  state.executionUpdatedAt = 140;
  view.rerender(<TopicsPage />);
  expect(current).toHaveAttribute("data-refresh-after", completedAt);
});

it("holds relative bounds between renders and advances them after completion", () => {
  state.status = "running";
  const view = render(<TopicsPage />, { wrapper: LayerProvider });
  const initialRange = state.currentTopics.mock.lastCall![0].timeRange;

  vi.setSystemTime(new Date("2026-10-09T12:01:00Z"));
  view.rerender(<TopicsPage />);
  expect(state.currentTopics.mock.lastCall![0].timeRange).toEqual(initialRange);

  state.status = "completed";
  state.updatedAt = "2026-10-09T12:01:00Z";
  view.rerender(<TopicsPage />);
  expect(state.currentTopics.mock.lastCall![0].timeRange).toEqual({
    from: new Date("2026-10-02T12:01:00Z"),
    to: new Date("2026-10-09T12:01:00Z"),
  });
});

const facet = (id: string, versions: number[]): TopicFacet => ({
  id,
  projectId: "project",
  name: id,
  description: "",
  isBuiltIn: true,
  versions: versions.map((version) => ({
    projectId: "project",
    facetId: id,
    version,
    prompt: "",
    createdAt: "2026-10-01T00:00:00Z",
  })),
});
const execution = (status: string, operation: "process" | "update") => ({
  id: `${operation}-${status}`,
  status,
  createdAt: "2026-10-09T11:00:00Z",
  updatedAt: "2026-10-09T11:00:00Z",
  input: { operation },
  facets: [],
});
/** Opens the manual dialog from the header menu; "process" switches to its summarize tab. */
async function openManualDialog(operation: "process" | "update" = "update") {
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Regenerate topics" }),
  );
  if (operation === "process")
    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "Summarize traces & embed" }),
      { button: 0, ctrlKey: false },
    );
}
function withSummaries() {
  state.facets = [
    facet("intent", [2, 1]),
    facet("outcome", [1]),
    facet("language", [1]),
  ];
  state.rules = [{ facetIds: ["intent", "outcome"] }];
  state.counts = [
    { facetId: "intent", facetVersion: 2, count: 240 },
    { facetId: "outcome", facetVersion: 1, count: 0 },
  ];
}

it.each([
  ["no facets", () => []],
  ["facets", () => [facet("intent", [1])]],
])(
  "requests results alongside facets and keeps that request when the run list loads, with %s",
  (_, facets) => {
    state.facets = facets();
    state.facetsLoading = true;
    state.executions = undefined;
    const view = render(<TopicsPage />, { wrapper: LayerProvider });
    expect(screen.queryByTestId("current-topics")).toBeNull();
    expect(state.currentTopics).toHaveBeenCalled();
    const requested = state.currentTopics.mock.lastCall![0];

    vi.setSystemTime(new Date("2026-10-09T12:01:00Z"));
    state.facetsLoading = false;
    state.executions = [execution("completed", "update")];
    view.rerender(<TopicsPage />);
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
    expect(state.currentTopics).toHaveBeenLastCalledWith(
      expect.objectContaining({
        refreshAfter: requested.refreshAfter,
        timeRange: requested.timeRange,
      }),
    );
  },
);

it("shows Analyze in the header while auto-analyze is off and keeps Analyze, regenerate, history and settings in the menu", async () => {
  withSummaries();
  render(<TopicsPage />, { wrapper: LayerProvider });
  fireEvent.click(screen.getByRole("button", { name: "Analyze" }));
  expect(state.openAutomaticProcessing).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "AnalyzeOff",
    "Regenerate topics",
    "History",
    "Settings",
  ]);
});

it("shows a paused auto-analyze status with its short reason", () => {
  withSummaries();
  state.settings.blockedAt = "2026-10-09T10:00:00Z";
  state.settings.blockMessage = "Fix the connection.";
  render(<TopicsPage />, { wrapper: LayerProvider });
  const control = screen.getByRole("button", { name: "Auto-analyze: Paused" });
  expect(control).toHaveAttribute("title", "Paused");
  fireEvent.click(control);
  expect(state.openAutomaticProcessing).toHaveBeenCalledWith(false);
});

it.each([
  {
    name: "without topics:CUD",
    setup: () => {
      state.canWrite = false;
    },
    reason: "You need permission to manage Topics in this project.",
  },
  {
    name: "while Topics is paused",
    setup: () => {
      state.settings.blockedAt = "2026-10-09T10:00:00Z";
      state.settings.blockMessage = "Fix the connection.";
    },
    reason: "Topics is paused. Fix the connection.",
  },
  {
    name: "while any Topics run is in progress",
    setup: () => {
      state.executions = [execution("running", "process")];
    },
    reason: "A Topics run is in progress. Wait for it to finish.",
  },
  {
    name: "before any summaries exist",
    setup: () => {
      state.counts = [];
    },
    reason:
      "No trace summaries in the selected time range yet. Summarize traces first, then regenerate.",
  },
])("disables Generate topics $name", async ({ setup, reason }) => {
  withSummaries();
  setup();
  render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    screen.getByRole("button", { name: "Generate topics" }),
  ).toBeDisabled();
  expect(screen.getByText(reason)).toBeInTheDocument();
});

it("requires an eligible selected facet and applies the small-sample threshold before generating topics", async () => {
  withSummaries();
  state.counts = [
    { facetId: "intent", facetVersion: 2, count: 13 },
    { facetId: "outcome", facetVersion: 1, count: 9 },
  ];
  render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
    button: 0,
    ctrlKey: false,
  });
  const submit = screen.getByRole("button", { name: "Generate topics" });
  expect(submit).toBeDisabled();
  fireEvent.click(submit);
  expect(state.trigger).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("switch", { name: "Small sample mode" }));
  expect(submit).toBeEnabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "intent" }));
  expect(submit).toBeDisabled();
  fireEvent.click(submit);
  expect(state.trigger).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("checkbox", { name: "intent" }));
  fireEvent.click(submit);
  await waitFor(() =>
    expect(state.trigger).toHaveBeenCalledWith(
      expect.objectContaining({ exploratory: true, minimumTraceCount: 10 }),
    ),
  );
});

it("counts summaries only while the open manual dialog is generating topics", async () => {
  withSummaries();
  render(<TopicsPage />, { wrapper: LayerProvider });
  const countRequests = () =>
    state.summaryCountInput.mock.calls.filter(
      ([input]) => typeof input !== "symbol",
    );
  expect(countRequests()).toHaveLength(0);
  await openManualDialog();
  expect(countRequests().length).toBeGreaterThan(0);
  const generatingRequests = countRequests().length;
  fireEvent.mouseDown(
    screen.getByRole("tab", { name: "Summarize traces & embed" }),
    { button: 0, ctrlKey: false },
  );
  expect(countRequests()).toHaveLength(generatingRequests);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(countRequests()).toHaveLength(generatingRequests);
});

it("keeps summary loading and refetching out of validation warnings", async () => {
  withSummaries();
  state.counts = state.counts.map((count) => ({ ...count, count: 240 }));
  state.countsPending = true;
  state.countsFetching = true;
  const page = render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
    button: 0,
    ctrlKey: false,
  });
  const dialog = within(
    screen.getByRole("dialog", { name: "Manual processing" }),
  );
  expect(
    dialog.getByRole("button", { name: "Generate topics" }),
  ).toBeDisabled();
  expect(dialog.queryByRole("alert")).toBeNull();
  expect(dialog.getByRole("status")).toHaveTextContent(/^2 facets selected$/);
  state.countsPending = false;
  state.countsFetching = false;
  page.rerender(<TopicsPage />);
  expect(dialog.getByRole("button", { name: "Generate topics" })).toBeEnabled();
  expect(dialog.getAllByText("240 summaries")[0]).toBeVisible();
  expect(dialog.getByRole("status")).toHaveTextContent(
    "2 facets selected · 480 stored summaries",
  );
  state.countsFetching = true;
  page.rerender(<TopicsPage />);
  expect(dialog.getAllByText("240 summaries")[0]).toBeVisible();
  expect(dialog.getByRole("status")).toHaveTextContent(
    "2 facets selected · 480 stored summaries",
  );
  expect(dialog.queryByRole("alert")).toBeNull();
  expect(
    dialog.getByRole("button", { name: "Generate topics" }),
  ).toBeDisabled();
});

it("regenerates the rule's facets that have summaries, at their latest version, over its default seven-day range, then opens the run", async () => {
  withSummaries();
  state.executions = [execution("completed", "update")];
  render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
    button: 0,
    ctrlKey: false,
  });

  const dialog = screen.getByRole("dialog", { name: "Manual processing" });
  expect(
    within(dialog).getByRole("checkbox", { name: "outcome" }),
  ).toBeChecked();
  expect(
    within(dialog).queryByRole("checkbox", { name: "language" }),
  ).toBeNull();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Generate topics" }),
  );

  await waitFor(() =>
    expect(state.push).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ executionId: "regenerated" }),
      }),
      undefined,
      { shallow: true },
    ),
  );
  expect(state.trigger).toHaveBeenCalledWith({
    projectId: "project",
    operation: "update",
    facets: [
      { facetId: "intent", version: 2 },
      { facetId: "outcome", version: 1 },
    ],
    exploratory: false,
    timeRange: {
      from: new Date("2026-10-02T12:00:00Z"),
      to: new Date("2026-10-09T12:00:00Z"),
    },
    minimumTraceCount: 100,
    requestId: expect.any(String),
  });
});

it("shows a regenerate failure that settles after the dialog was closed and reopened, and retries with the same requestId", async () => {
  withSummaries();
  let fail: (error: Error) => void = () => {};
  state.trigger.mockImplementationOnce(
    () => new Promise((_, reject) => (fail = reject)),
  );
  render(<TopicsPage />, { wrapper: LayerProvider });
  const open = async () => {
    await openManualDialog();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
      button: 0,
      ctrlKey: false,
    });
    return screen.getByRole("dialog", { name: "Manual processing" });
  };

  fireEvent.click(
    within(await open()).getByRole("button", { name: "Generate topics" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const reopened = await open();
  fail(new Error("Clustering connection failed."));

  expect(
    await within(reopened).findByText("Clustering connection failed."),
  ).toBeInTheDocument();
  fireEvent.click(
    within(reopened).getByRole("button", { name: "Generate topics" }),
  );
  await waitFor(() => expect(state.trigger).toHaveBeenCalledTimes(2));
  const [first, second] = state.trigger.mock.calls.map(
    ([input]) => (input as { requestId: string }).requestId,
  );
  expect(second).toBe(first);
});

it("summarizes the frozen trace selection for active facets and opens the progress drawer", async () => {
  withSummaries();
  render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog("process");
  const dialog = screen.getByRole("dialog", { name: "Manual processing" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Summarize & embed" }),
  );

  await waitFor(() =>
    expect(state.push).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ executionId: "regenerated" }),
      }),
      undefined,
      { shallow: true },
    ),
  );
  expect(state.trigger).toHaveBeenCalledWith({
    projectId: "project",
    operation: "process",
    facets: [
      { facetId: "intent", version: 2 },
      { facetId: "outcome", version: 1 },
    ],
    reuseExistingSummaries: true,
    selection: {
      filter: [],
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-10-09T12:00:00Z"),
      limit: 2,
      sampling: "random",
      seed: "frozen-preview",
      excludedTraceIds: ["excluded-trace"],
    },
    requestId: expect.any(String),
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("hands off from manual processing to Topics model configuration", async () => {
  withSummaries();
  render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog("process");
  const dialog = screen.getByRole("dialog", { name: "Manual processing" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Configure Topics" }),
  );
  expect(state.openConfigure).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Manual processing" }),
    ).toBeNull(),
  );
  expect(state.trigger).not.toHaveBeenCalled();
});

it("freezes an independent generation range for summary counts and submission", async () => {
  withSummaries();
  render(<TopicsPage />, { wrapper: LayerProvider });
  await openManualDialog();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
    button: 0,
    ctrlKey: false,
  });
  const dialog = screen.getByRole("dialog", { name: "Manual processing" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Select last 30 days" }),
  );
  const expectedRange = {
    from: new Date("2026-09-09T12:00:00Z"),
    to: new Date("2026-10-09T12:00:00Z"),
  };
  expect(state.summaryCountInput).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange: expectedRange }),
  );
  vi.setSystemTime(new Date("2026-10-09T12:05:00Z"));
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Generate topics" }),
  );
  await waitFor(() => expect(state.trigger).toHaveBeenCalled());
  expect(state.trigger.mock.lastCall![0].timeRange).toEqual({
    from: new Date("2026-09-09T12:00:00Z"),
    to: new Date("2026-10-09T12:00:00Z"),
  });
  expect(state.setQueryParams).not.toHaveBeenCalled();
});

it.each(["relative", "absolute"])(
  "refreshes summary counts on reopening and preserves %s range semantics",
  async (rangeKind) => {
    withSummaries();
    state.counts = [];
    const view = render(<TopicsPage />, { wrapper: LayerProvider });
    await openManualDialog();
    if (rangeKind === "absolute") {
      fireEvent.mouseDown(
        screen.getByRole("tab", { name: "Generate topics" }),
        { button: 0, ctrlKey: false },
      );
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Select custom dates",
        }),
      );
    }
    expect(state.invalidateSummaryCounts).toHaveBeenCalledWith({
      projectId: "project",
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    state.counts = [{ facetId: "intent", facetVersion: 2, count: 120 }];
    vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
    view.rerender(<TopicsPage />);
    await openManualDialog();
    expect(state.invalidateSummaryCounts).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("button", { name: "Generate topics" }),
    ).toBeEnabled();
    const expectedRange =
      rangeKind === "relative"
        ? {
            from: new Date("2026-10-03T12:00:00Z"),
            to: new Date("2026-10-10T12:00:00Z"),
          }
        : {
            from: new Date("2026-10-01T00:00:00Z"),
            to: new Date("2026-10-08T00:00:00Z"),
          };
    expect(state.summaryCountInput.mock.lastCall![0].timeRange).toEqual(
      expectedRange,
    );
    vi.setSystemTime(new Date("2026-10-10T12:05:00Z"));
    fireEvent.click(screen.getByRole("button", { name: "Generate topics" }));
    await waitFor(() => expect(state.trigger).toHaveBeenCalled());
    expect(state.trigger.mock.lastCall![0].timeRange).toEqual(expectedRange);
  },
);

it.each(["settings", "readiness", "connections"] as const)(
  "shows a failed %s configuration query and recovers after it succeeds",
  async (query) => {
    withSummaries();
    state.configurationFailure = query;
    const view = render(<TopicsPage />, { wrapper: LayerProvider });
    await openManualDialog("process");
    expect(
      screen.getByText(
        /Could not load Topics configuration: Configuration unavailable\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Loading Topics configuration…"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Summarize & embed" }),
    ).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("button", { name: "Generate topics" }),
    ).toBeDisabled();
    expect(state.trigger).not.toHaveBeenCalled();
    state.configurationFailure = null;
    view.rerender(<TopicsPage />);
    expect(
      screen.getByRole("button", { name: "Generate topics" }),
    ).toBeEnabled();
    expect(
      screen.queryByText(/Could not load Topics configuration/),
    ).not.toBeInTheDocument();
  },
);

it.each([
  ["loading rules", "Checking the active Topics facets…"],
  ["failed rules", "Could not load active Topics facets: Rules unavailable."],
  ["loading runs", "Checking for Topics runs in progress…"],
  ["failed runs", "Could not check Topics runs: Runs unavailable."],
])(
  "blocks both operations while prerequisites are unknown: %s",
  async (condition, reason) => {
    withSummaries();
    if (condition === "loading rules") state.rulesPending = true;
    if (condition === "failed rules")
      state.rulesError = new Error("Rules unavailable.");
    if (condition === "loading runs") state.executions = undefined;
    if (condition === "failed runs")
      state.executionsError = new Error("Runs unavailable.");
    const { rerender } = render(<TopicsPage />, { wrapper: LayerProvider });
    await openManualDialog("process");
    expect(
      screen.getByRole("button", { name: "Summarize & embed" }),
    ).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Generate topics" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("button", { name: "Generate topics" }),
    ).toBeDisabled();
    expect(state.summaryCountInput.mock.lastCall![0]).toEqual(
      expect.any(Symbol),
    );
    expect(state.trigger).not.toHaveBeenCalled();
    state.rulesPending = false;
    state.rulesError = null;
    state.executions = [];
    state.executionsError = null;
    rerender(<TopicsPage />);
    expect(
      screen.getByRole("button", { name: "Generate topics" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("checkbox", { name: "language" }),
    ).not.toBeInTheDocument();
  },
);

it("shows the setup landing until the project's first stored summary exists", () => {
  state.hasStoredSummaries = false;
  const view = render(<TopicsPage />, { wrapper: LayerProvider });
  expect(screen.getByRole("button", { name: "Set up topics" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /^Analyze/ })).toBeNull();
  expect(screen.queryByTestId("current-topics")).toBeNull();
  state.hasStoredSummaries = true;
  view.rerender(<TopicsPage />);
  expect(screen.getByTestId("current-topics")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Set up topics" })).toBeNull();
});

it("opens generation directly from the empty topics panel", () => {
  withSummaries();
  state.showGenerateCTA = true;
  render(<TopicsPage />, { wrapper: LayerProvider });
  fireEvent.click(screen.getByRole("button", { name: "Generate topics" }));
  const dialog = within(
    screen.getByRole("dialog", { name: "Manual processing" }),
  );
  expect(dialog.getByRole("tab", { name: "Generate topics" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(dialog.getByRole("button", { name: "Generate topics" })).toBeEnabled();
});

it("keeps date controls reachable when a disabled results query has no data", () => {
  state.resultsDataAvailable = false;
  state.dateRange = rangeToString({
    from: new Date("2026-10-10T00:00:00Z"),
    to: new Date("2026-10-09T00:00:00Z"),
  });
  render(<TopicsPage />, { wrapper: LayerProvider });
  expect(
    screen.getByRole("button", { name: "Select last 30 days" }),
  ).toBeVisible();
  expect(screen.queryByText("See what your traces are about")).toBeNull();
});
