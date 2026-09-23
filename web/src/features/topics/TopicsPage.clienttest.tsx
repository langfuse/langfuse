import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TopicsPage from "./TopicsPage";

const state = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  status: "failed",
  push: vi.fn(),
  replace: vi.fn(),
  retry: vi.fn(),
  refetchExecution: vi.fn(),
}));
const pathname = "/project/[projectId]/topics";
const retainedQuery = {
  projectId: "project",
  peek: "trace-a",
  display: "details",
};

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: state.query,
    pathname,
    push: state.push,
    replace: state.replace,
  }),
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({
    headerProps,
    children,
  }: {
    headerProps: { actionButtonsRight: ReactNode };
    children: ReactNode;
  }) => (
    <>
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
vi.mock("./TopicPipelineForm", () => ({ TopicPipelineForm: () => null }));
vi.mock("./CurrentTopics", () => ({
  CurrentTopics: () => (
    <input
      aria-label="Current topic selection"
      data-testid="current-topics"
      defaultValue=""
    />
  ),
}));
vi.mock("@/src/utils/api", () => {
  const execution = () => ({
    id: "execution",
    status: state.status,
    phase: state.status === "queued" ? "queued" : "summarizing",
    createdAt: "2026-09-23T12:00:00Z",
    input: {
      operation: "process",
      embeddingConfig: { embeddingDimensions: 768 },
    },
    facets: [],
    error: null,
  });
  return {
    api: {
      topics: {
        facets: { useQuery: () => ({ data: [] }) },
        executions: { useQuery: () => ({ data: [execution()] }) },
        initialize: { useMutation: () => ({}) },
        execution: {
          useQuery: () => ({
            data: execution(),
            refetch: state.refetchExecution,
          }),
        },
        traceErrors: { useQuery: () => ({}) },
        retry: {
          useMutation: ({ onSuccess }: { onSuccess: () => void }) => ({
            mutate: (input: unknown) => {
              state.retry(input);
              state.status = "queued";
              onSuccess();
            },
          }),
        },
      },
      useUtils: () => ({
        topics: { executions: { invalidate: vi.fn() } },
      }),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  state.query = { ...retainedQuery };
  state.status = "failed";
  for (const navigate of [state.push, state.replace]) {
    navigate.mockImplementation(({ query }: { query: typeof state.query }) => {
      state.query = query;
      return Promise.resolve(true);
    });
  }
});

describe("Topics execution history", () => {
  it("keeps current results mounted through a run link, history navigation, and closing status", () => {
    const view = render(<TopicsPage />);
    const current = screen.getByTestId("current-topics");
    fireEvent.change(current, { target: { value: "Billing" } });

    state.query = { ...state.query, executionId: "execution" };
    view.rerender(<TopicsPage />);
    const status = screen.getByRole("dialog", { name: "Run status" });
    expect(current).toBeInTheDocument();
    fireEvent.click(within(status).getByRole("button", { name: "All runs" }));
    expect(state.replace).toHaveBeenLastCalledWith(
      { pathname, query: retainedQuery },
      undefined,
      { shallow: true },
    );
    view.rerender(<TopicsPage />);

    const history = screen.getByRole("dialog", { name: "Past executions" });
    fireEvent.click(
      within(history).getByRole("button", {
        name: /Process traces.*Run failed/,
      }),
    );
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname, query: { ...retainedQuery, executionId: "execution" } },
      undefined,
      { shallow: true },
    );
    view.rerender(<TopicsPage />);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Run status" })).getByRole(
        "button",
        { name: "Close" },
      ),
    );
    view.rerender(<TopicsPage />);

    expect(state.query).toEqual(retainedQuery);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("current-topics")).toBe(current);
    expect(current).toHaveValue("Billing");
  });

  it("retries a failed run from status and refreshes its progress", () => {
    state.query.executionId = "execution";
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
    expect(screen.getByTestId("current-topics")).toBeInTheDocument();
  });
});
