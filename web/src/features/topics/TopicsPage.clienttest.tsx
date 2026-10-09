import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";

const state = vi.hoisted(() => ({
  status: "failed",
  executionUpdatedAt: 110,
  executionId: "execution" as string | null,
  facetsLoading: false,
  facets: [] as {
    id: string;
    name: string;
    isBuiltIn: boolean;
    versions: { version: number; prompt: string }[];
  }[],
  results: [] as { facetId: string; name: string }[],
  updatedAt: "2026-09-23T12:00:00Z",
  retry: vi.fn(),
  refetchExecution: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project", executionId: state.executionId },
  }),
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({
    children,
    headerProps,
  }: {
    children: ReactNode;
    headerProps: {
      actionButtonsLeft: ReactNode;
      actionButtonsRight: ReactNode;
    };
  }) => (
    <>
      {headerProps.actionButtonsLeft}
      {headerProps.actionButtonsRight}
      {children}
    </>
  ),
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
    openConfiguration: vi.fn(),
    configuration: null,
  }),
}));
vi.mock("./CurrentTopics", () => ({
  useCurrentTopics: ({
    running,
    refreshAfter,
  }: {
    running: boolean;
    refreshAfter: number;
  }) => ({ running, refreshAfter, data: state.results }),
  CurrentTopics: ({
    result,
    selectedFacetId,
  }: {
    result: { running: boolean; refreshAfter: number };
    selectedFacetId: string | undefined;
  }) => (
    <div
      data-testid="current-topics"
      data-running={result.running}
      data-refresh-after={result.refreshAfter}
      data-selected-facet={selectedFacetId}
    />
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      facets: {
        useQuery: () => ({
          data: state.facetsLoading ? undefined : state.facets,
          isLoading: state.facetsLoading,
        }),
      },
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
  state.executionId = "execution";
  state.facetsLoading = false;
  state.facets = [];
  state.results = [];
  state.executionUpdatedAt = 110;
  state.updatedAt = "2026-09-23T12:00:00Z";
});

it("waits for initial facets before mounting interactive workspace controls", () => {
  state.executionId = null;
  state.facetsLoading = true;
  const view = render(<TopicsPage />);
  expect(screen.queryByRole("button", { name: "Topics actions" })).toBeNull();
  expect(screen.queryByTestId("current-topics")).toBeNull();
  expect(screen.getByText("Loading topics…")).toBeInTheDocument();

  state.facetsLoading = false;
  state.facets = [
    {
      id: "intent",
      name: "Intent",
      isBuiltIn: true,
      versions: [{ version: 1, prompt: "Intent" }],
    },
  ];
  state.results = [{ facetId: "intent", name: "Intent" }];
  view.rerender(<TopicsPage />);
  expect(
    screen.getByRole("button", { name: "Topics actions" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "Topics facet" }),
  ).toHaveTextContent("Intent");
  expect(screen.getByTestId("current-topics")).toHaveAttribute(
    "data-selected-facet",
    "intent",
  );
});

it("preserves the selected facet through result refresh and derives a fallback if it disappears", () => {
  state.executionId = null;
  state.results = [
    { facetId: "intent", name: "Intent" },
    { facetId: "issues", name: "Issues" },
  ];
  const view = render(<TopicsPage />);
  const current = screen.getByTestId("current-topics");
  expect(current).toHaveAttribute("data-selected-facet", "intent");
  const picker = screen.getByRole("combobox", { name: "Topics facet" });
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: "Issues" }));
  expect(current).toHaveAttribute("data-selected-facet", "issues");

  state.results = state.results.map((facet) => ({ ...facet }));
  view.rerender(<TopicsPage />);
  expect(current).toHaveAttribute("data-selected-facet", "issues");
  expect(picker).toHaveTextContent("Issues");

  state.results = [{ facetId: "intent", name: "Intent" }];
  view.rerender(<TopicsPage />);
  expect(current).toHaveAttribute("data-selected-facet", "intent");
  expect(picker).toHaveTextContent("Intent");
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
