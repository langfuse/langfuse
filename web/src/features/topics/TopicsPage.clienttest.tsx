import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";
import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";
import { rangeToString, type TimeRange } from "@/src/utils/date-range-utils";

const state = vi.hoisted(() => ({
  status: "failed",
  executionUpdatedAt: 110,
  updatedAt: "2026-09-23T12:00:00Z",
  retry: vi.fn(),
  refetchExecution: vi.fn(),
  dateRange: undefined as string | undefined,
  executionId: undefined as string | undefined,
  setQueryParams: vi.fn(),
  currentTopics: vi.fn(),
  pipeline: vi.fn(),
  picker: vi.fn(),
}));

vi.mock("use-query-params", () => ({
  StringParam: {},
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
      <button onClick={() => props.onTimeRangeChange({ range: "last30Days" })}>
        Select last 30 days
      </button>
    );
  },
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project", executionId: state.executionId },
  }),
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({}),
}));
vi.mock("@/src/components/table/peek/peek-trace-detail", () => ({
  TablePeekViewTraceDetail: () => null,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => true,
}));
vi.mock("./TopicPipelineForm", () => ({
  useTopicPipelineForm: (input: unknown) => {
    state.pipeline(input);
    return {
      primaryAction: null,
      openConfiguration: vi.fn(),
      configuration: null,
    };
  },
}));
vi.mock("./CurrentTopics", () => ({
  useCurrentTopics: (input: {
    running: boolean;
    refreshAfter: number;
    timeRange: { from: Date; to: Date };
  }) => {
    state.currentTopics(input);
    return { ...input, data: [] };
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
    />
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      facets: { useQuery: () => ({ data: [], isLoading: false }) },
      executions: { useQuery: () => ({ data: [] }) },
      initialize: { useMutation: () => ({}) },
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
    useUtils: () => ({
      topics: { executions: { invalidate: vi.fn() } },
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
  state.status = "failed";
  state.executionUpdatedAt = 110;
  state.updatedAt = "2026-09-23T12:00:00Z";
  state.dateRange = undefined;
  state.executionId = undefined;
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
    render(<TopicsPage />);
    const { timeRange } = state.currentTopics.mock.lastCall![0];
    expect(timeRange.to.getTime() - timeRange.from.getTime()).toBe(
      minutes * 60_000,
    );
    expect(state.pipeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeRange }),
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
  const view = render(<TopicsPage />);
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
    render(<TopicsPage />);

    const { timeRange } = state.currentTopics.mock.lastCall![0];
    expect(timeRange).toEqual({
      from: new Date(Date.now() - 90 * 86_400_000),
      to: new Date(),
    });
    expect(state.picker).toHaveBeenLastCalledWith({ range: "last90Days" });
    expect(state.pipeline).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeRange }),
    );
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
  const view = render(<TopicsPage />);
  expect(state.currentTopics).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange: expected }),
  );
  expect(state.picker).toHaveBeenLastCalledWith(expected);
  expect(state.pipeline).toHaveBeenLastCalledWith(
    expect.objectContaining({ timeRange: expected }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
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
    render(<TopicsPage />);
    expect(state.picker).toHaveBeenLastCalledWith(timeRange);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(state.setQueryParams).not.toHaveBeenCalled();
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
  },
);

it("refreshes current results through retry and completion for a selected run outside history", () => {
  state.executionId = "execution";
  const view = render(<TopicsPage />);
  const status = screen.getByRole("dialog", { name: "Run status" });
  fireEvent.click(
    within(status).getByRole("button", { name: "Resume interrupted stages" }),
  );
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
  const view = render(<TopicsPage />);
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
