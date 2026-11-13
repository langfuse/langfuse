import { useState, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";
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
  rules: [] as Array<{ id?: string; facetIds: string[] }>,
  maps: undefined as unknown,
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
vi.mock(
  "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled",
  () => ({
    useInternalFeaturesEnabled: () => false,
  }),
);
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => state.canWrite,
}));
vi.mock("@/src/components/error-page", () => ({
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
      maps: { useQuery: () => ({ data: state.maps }) },
      ruleSetupStatus: { useQuery: () => ({ data: null }) },
      startRuleSetup: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(),
        }),
      },
      analysisResults: { useQuery: () => ({}) },
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
      },
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
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

it("keeps the question picker reachable with the mobile header", () => {
  state.mobileHeader = true;
  state.resultFacets = [{ facetId: "intent", name: "Intent" }];
  state.rules = [{ facetIds: ["intent"] }];
  render(<TopicsPage />);
  expect(screen.getByRole("combobox", { name: "Topics facet" })).toBeTruthy();
});

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

it("puts New map and New snapshot first in the menu", async () => {
  withSummaries();
  render(<TopicsPage />, { wrapper: LayerProvider });
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "New map",
    "New snapshot",
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
  render(<TopicsPage />, { wrapper: LayerProvider });
  const editMap = screen.getByRole("button", { name: "Edit map" });
  expect(editMap).toHaveProperty("disabled", !canWrite);
  fireEvent.click(screen.getByRole("button", { name: "Topics actions" }));
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).not.toContain("Edit map");
  // Every action stays visible; without write access it is disabled with a reason.
  for (const label of ["New map", "New snapshot"]) {
    const item = items.find((candidate) => candidate.textContent === label);
    expect(item).toBeDefined();
    expect(item!.getAttribute("aria-disabled")).toBe(canWrite ? null : "true");
    expect(item!.getAttribute("title")).toBe(
      canWrite ? null : "You need permission to edit Topics.",
    );
  }
});

it("shows the setup landing until the project's first stored summary exists", () => {
  state.hasStoredSummaries = false;
  const view = render(<TopicsPage />, { wrapper: LayerProvider });
  expect(screen.getByRole("button", { name: "Set up topics" })).toBeEnabled();
  expect(screen.queryByTestId("current-topics")).toBeNull();
  state.hasStoredSummaries = true;
  view.rerender(<TopicsPage />);
  expect(screen.getByTestId("current-topics")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Set up topics" })).toBeNull();
});
