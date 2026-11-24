import { useState, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";
import { type TopicFacet } from "@langfuse/shared/topics";
import { type TopicRunCost } from "./topic-run-labels";
import { type RouterOutputs } from "@/src/utils/api";

const state = vi.hoisted(() => ({
  canViewTopics: true,
  status: "failed",
  executionUpdatedAt: 110,
  updatedAt: "2026-09-23T12:00:00Z",
  retry: vi.fn(),
  refetchExecution: vi.fn(),
  queryCosts: vi.fn<() => Promise<Record<string, TopicRunCost>>>(),
  dateRange: undefined as string | undefined,
  executionId: undefined as string | undefined,
  map: undefined as string | undefined,
  setQueryParams: vi.fn(),
  currentTopics: vi.fn(),
  hasStoredSummaries: true,
  resultsDataAvailable: true,
  mobileHeader: false,
  resultFacets: [] as Array<{ facetId: string; name: string }>,
  openAutomaticProcessing: vi.fn(),
  push: vi.fn(),
  openConfigure: vi.fn(),
  canWrite: true,
  facets: [] as TopicFacet[],
  facetsLoading: false,
  workspaceMounts: 0,
  executions: [] as unknown[] | undefined,
  executionsError: null as Error | null,
  rulesPending: false,
  rulesError: null as Error | null,
  configurationFailure: null as "settings" | "readiness" | "connections" | null,
  settings: {} as Record<string, unknown>,
  rules: [] as Array<{
    id?: string;
    facetIds: string[];
    name?: string;
  }>,
  queryMapCosts:
    vi.fn<
      (input: {
        projectId: string;
      }) => Promise<RouterOutputs["topics"]["ruleMapCosts"]>
    >(),
  maps: undefined as unknown,
  capture: vi.fn(),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({
    project: { id: "project" },
    organization: { id: "org" },
  }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => state.capture,
}));

vi.mock("./useOpenTopicsFeedback", () => ({
  useOpenTopicsFeedback: () => vi.fn(),
}));
vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: () => [undefined, vi.fn()],
  useQueryParams: () => [{ dateRange: state.dateRange }, state.setQueryParams],
}));
vi.mock("@/src/components/layouts/page-header-controls-slot", () => ({
  PageHeaderControlsPortal: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {
      projectId: "project",
      executionId: state.executionId,
      map: state.map,
    },
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
vi.mock("@/src/components/ErrorPage", () => ({
  ErrorPage: ({ message }: { message: string }) => <p>{message}</p>,
}));
vi.mock("@/src/features/topics/topicsAccess", () => ({
  useCanViewTopics: () => state.canViewTopics,
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
    useState(() => state.workspaceMounts++);
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
  }: {
    result: { running: boolean; refreshAfter: number };
  }) => (
    <div
      data-testid="current-topics"
      data-running={result.running}
      data-refresh-after={result.refreshAfter}
    ></div>
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      executionCostBreakdown: {
        _def: () => ({ path: ["topics", "executionCostBreakdown"] }),
      },
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
      execution: {
        useQuery: () => ({
          data: {
            id: "execution",
            status: state.status,
            phase: state.status === "queued" ? "queued" : "summarizing",
            createdAt: "2026-09-23T12:00:00Z",
            updatedAt: state.updatedAt,
            input: {
              operation: "update",
              embeddingConfig: { embeddingDimensions: 1024 },
            },
            facets: [],
            error: null,
          },
          dataUpdatedAt: state.executionUpdatedAt,
          refetch: state.refetchExecution,
        }),
      },
      // Settings read the rules from the maps overview.
      maps: {
        useQuery: () => ({
          data: state.rulesPending
            ? undefined
            : (state.maps ?? {
                // A settled live map per rule, so the page shows its results.
                rules: state.rules.map((rule, index) => ({
                  id: `rule-${index}`,
                  projectId: "project",
                  name: "Rule",
                  filter: [],
                  sampling: 1,
                  enabled: true,
                  updatedAt: "2026-11-01T00:00:00Z",
                  lastRefitAt: "2026-11-01T00:00:00Z",
                  refresh: { running: false, availableAt: null },
                  ...rule,
                })),
                analyses: [],
              }),
        }),
      },
      ruleSetupStatus: { useQuery: () => ({ data: null }) },
      ruleMapCosts: {
        useQuery: (
          input: { projectId: string },
          options: { enabled: boolean; staleTime: number },
        ) =>
          useQuery({
            queryKey: ["topics.ruleMapCosts", input],
            queryFn: () => state.queryMapCosts(input),
            ...options,
          }),
      },
      startRuleSetup: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
        }),
      },
      analysisResults: { useQuery: () => ({}) },
      // The map picker's preview pane.
      currentResults: { useQuery: () => ({ isLoading: false }) },
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
      client: {
        topics: {
          executionCostBreakdown: { query: state.queryCosts },
        },
      },
      topics: {
        modelSettings: { invalidate: vi.fn() },
        maps: { invalidate: vi.fn() },
        executions: { invalidate: vi.fn() },
      },
    }),
  },
}));

function renderTopicsPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<TopicsPage />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <LayerProvider>{children}</LayerProvider>
      </QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.queryCosts.mockReset().mockResolvedValue({});
  state.maps = undefined;
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
  state.map = undefined;
  state.canWrite = true;
  state.facets = [];
  state.facetsLoading = false;
  state.workspaceMounts = 0;
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
  state.queryMapCosts.mockReset().mockResolvedValue({});
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
  renderTopicsPage();
  expect(screen.getByText("This page is not available.")).toBeTruthy();
  expect(state.currentTopics).not.toHaveBeenCalled();
});

it("keeps the question picker reachable with the mobile header", () => {
  state.mobileHeader = true;
  state.resultFacets = [{ facetId: "intent", name: "Intent" }];
  state.rules = [{ facetIds: ["intent"] }];
  renderTopicsPage();
  expect(screen.getByRole("combobox", { name: "Topics facet" })).toBeTruthy();
});

it("refreshes current results through retry and completion for a selected run outside history", () => {
  state.executionId = "execution";
  const view = renderTopicsPage();
  const status = screen.getByRole("dialog", { name: "Regenerate topics" });
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
function withSummaries() {
  state.facets = [
    facet("intent", [2, 1]),
    facet("outcome", [1]),
    facet("language", [1]),
  ];
  state.rules = [{ facetIds: ["intent", "outcome"] }];
}

it.each(["live map", "snapshot"])(
  "loads a %s cost on opening the picker and reuses it on reopen",
  async (kind) => {
    withSummaries();
    state.queryMapCosts.mockResolvedValue({ "rule-0": 0 });
    state.queryCosts.mockResolvedValue({
      snapshot: { summaries: null, naming: 0.13 },
    });
    if (kind === "snapshot") {
      state.maps = {
        rules: [],
        analyses: [
          {
            id: "snapshot",
            label: "Checkout snapshot",
            facetIds: ["intent"],
            filter: [],
            status: "completed",
            createdAt: state.updatedAt,
            updatedAt: state.updatedAt,
            timeRange: {
              from: new Date("2026-09-22"),
              to: new Date("2026-09-23"),
            },
            traceCount: 20,
          },
        ],
      };
      state.map = "analysis:snapshot";
    }
    renderTopicsPage();
    const trigger = screen.getByRole("button", { name: /Topic map:/ });
    expect(state.queryMapCosts).not.toHaveBeenCalled();
    expect(state.queryCosts).not.toHaveBeenCalled();

    const cost = kind === "snapshot" ? "~$0.13" : "~$0.00";
    fireEvent.click(trigger);
    expect(await screen.findByText(cost)).toBeVisible();
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Topic maps" })).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByText(cost)).toBeVisible();
    expect(state.queryMapCosts).toHaveBeenCalledTimes(
      kind === "live map" ? 1 : 0,
    );
    expect(state.queryCosts).toHaveBeenCalledTimes(kind === "snapshot" ? 1 : 0);
  },
);

it("keeps settled costs visible while fetching the final cost of a completed run", async () => {
  withSummaries();
  const settled = execution("completed", "process");
  const unpriced = { ...settled, id: "unpriced" };
  const active = execution("running", "update");
  state.executions = [settled, unpriced, active];
  const finalCosts = Promise.withResolvers<Record<string, TopicRunCost>>();
  state.queryCosts
    .mockResolvedValueOnce({
      [settled.id]: { summaries: 0, naming: null },
      [active.id]: { summaries: null, naming: 0.12 },
    })
    .mockReturnValueOnce(finalCosts.promise);
  const view = renderTopicsPage();
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "History" }));
  expect(await screen.findByText("~$0.12")).toBeVisible();

  state.executions = [settled, unpriced, { ...active, status: "completed" }];
  view.rerender(<TopicsPage />);
  expect(screen.getByText("~$0.00")).toBeVisible();
  expect(screen.getByText("Unavailable")).toBeVisible();
  expect(screen.getByText("Loading…")).toBeVisible();
  expect(state.queryCosts).toHaveBeenLastCalledWith(
    {
      projectId: "project",
      executionIds: [active.id],
      includeSummaryCosts: false,
    },
    expect.anything(),
  );
  finalCosts.resolve({
    [active.id]: { summaries: null, naming: 0.34 },
  });
  expect(await screen.findByText("~$0.34")).toBeVisible();
});

it.each([
  ["no facets", () => []],
  ["facets", () => [facet("intent", [1])]],
])(
  "requests results alongside facets and keeps that request when the run list loads, with %s",
  (_, facets) => {
    state.facets = facets();
    state.facetsLoading = true;
    state.executions = undefined;
    const view = renderTopicsPage();
    expect(screen.queryByTestId("current-topics")).toBeNull();
    expect(state.currentTopics).toHaveBeenCalled();
    const { refreshAfter } = state.currentTopics.mock.lastCall![0];

    state.facetsLoading = false;
    state.executions = [execution("completed", "update")];
    view.rerender(<TopicsPage />);
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
    expect(state.workspaceMounts).toBe(1);
    expect(state.currentTopics).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshAfter }),
    );
  },
);

it("leaves creating and refreshing maps to the map picker, not the menu", async () => {
  withSummaries();
  renderTopicsPage();
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "History",
    "Settings",
  ]);
});

it.each([
  { access: "with topics:CUD", canWrite: true },
  { access: "without topics:CUD", canWrite: false },
])("shows Edit map as a header button $access", async ({ canWrite }) => {
  withSummaries();
  state.canWrite = canWrite;
  state.maps = {
    rules: [
      {
        id: "rule-1",
        projectId: "project",
        name: "All generations",
        filter: [],
        sampling: 1,
        facetIds: ["intent"],
        enabled: true,
        updatedAt: "2026-11-01T00:00:00Z",
        lastRefitAt: "2026-11-01T00:00:00Z",
        refresh: { availableAt: null, running: false },
      },
    ],
    analyses: [],
  };
  renderTopicsPage();
  const editMap = screen.getByRole("button", { name: "Edit map" });
  expect(editMap).toHaveProperty("disabled", !canWrite);
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.some((item) => item.textContent?.startsWith("Edit map"))).toBe(
    false,
  );
});

it("offers creating maps in the menu while onboarding hides the map picker", async () => {
  withSummaries();
  // Configured but off, and no summaries stored yet.
  state.settings = { ...state.settings, enabled: false };
  state.hasStoredSummaries = false;
  renderTopicsPage();
  expect(screen.queryByRole("button", { name: /Topic map:/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "New live map",
    "New snapshot",
    "History",
    "Settings",
  ]);
});

it.each([
  { access: "with topics:CUD", canWrite: true },
  { access: "without topics:CUD", canWrite: false },
])(
  "offers refreshing and creating maps in the map picker $access",
  async ({ canWrite }) => {
    withSummaries();
    state.canWrite = canWrite;
    // A refresh needs automatic processing on.
    state.settings = { ...state.settings, enabled: true };
    renderTopicsPage();
    fireEvent.click(screen.getByRole("button", { name: "Topic map: Rule" }));
    const picker = within(
      await screen.findByRole("dialog", { name: "Topic maps" }),
    );
    // Every entry stays visible; without write access it is disabled and says why on screen.
    for (const name of [/^New live map/, /^New snapshot/]) {
      const entry = picker.getByRole("button", { name });
      expect(entry).toHaveProperty("disabled", !canWrite);
      expect(
        entry.textContent?.includes("You need permission to edit Topics."),
      ).toBe(!canWrite);
    }
    // The preview card's Refresh, at its top right.
    expect(picker.getByRole("button", { name: "Refresh" })).toHaveProperty(
      "disabled",
      !canWrite,
    );
    expect(
      picker
        .queryAllByText("You need permission to edit Topics.")
        .some((element) => element.tagName === "P"),
    ).toBe(!canWrite);
  },
);

it("shows the setup landing until the project's first stored summary exists", () => {
  state.hasStoredSummaries = false;
  const view = renderTopicsPage();
  expect(screen.getByRole("button", { name: "Set up topics" })).toBeEnabled();
  expect(screen.queryByTestId("current-topics")).toBeNull();
  state.hasStoredSummaries = true;
  view.rerender(<TopicsPage />);
  expect(screen.getByTestId("current-topics")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Set up topics" })).toBeNull();
  // The page view keeps the state it first showed, once per mount.
  const context = { projectId: "project", orgId: "org", isV4: true };
  const events = state.capture.mock.calls.map(([event]) => event);
  expect(events.filter((event) => event === "topics:page_viewed")).toHaveLength(
    1,
  );
  expect(state.capture).toHaveBeenCalledWith(
    "topics:page_viewed",
    expect.objectContaining({ ...context, pageState: "landing" }),
  );
});
