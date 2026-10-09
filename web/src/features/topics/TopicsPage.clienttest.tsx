import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";

const state = vi.hoisted(() => ({
  status: "failed",
  executionUpdatedAt: 110,
  updatedAt: "2026-09-23T12:00:00Z",
  retry: vi.fn(),
  refetchExecution: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project", executionId: "execution" },
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
  useTopicPipelineForm: () => ({
    primaryAction: null,
    triggerAction: null,
    configuration: null,
  }),
}));
vi.mock("./TopicModelSettings", () => ({
  useTopicModelSettings: () => ({ action: null, notice: null }),
}));
vi.mock("./CurrentTopics", () => ({
  useCurrentTopics: ({
    running,
    refreshAfter,
  }: {
    running: boolean;
    refreshAfter: number;
  }) => ({ running, refreshAfter, data: [] }),
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
});

afterEach(() => vi.unstubAllGlobals());

it("refreshes current results through retry and completion for a selected run outside history", () => {
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
