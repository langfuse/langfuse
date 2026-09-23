import { type ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { CurrentTopics } from "./CurrentTopics";

const state = vi.hoisted(() => ({
  data: [] as unknown[],
  push: vi.fn(),
  inspect: vi.fn(),
  queryClient: undefined as QueryClient | undefined,
  fetchResults: vi.fn(),
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    pathname: "/project/[projectId]/topics",
    push: state.push,
  }),
}));
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));
vi.mock("@/src/components/table/peek/peek-trace-detail", () => ({
  TablePeekViewTraceDetail: () => <div data-testid="trace-peek" />,
}));
vi.mock("@/src/utils/api", async () => {
  const { QueryClient, useQuery } = await import("@tanstack/react-query");
  const idleClient = new QueryClient();
  return {
    getPathnameWithoutBasePath: () => "/project/project/topics",
    api: {
      topics: {
        currentResults: {
          useQuery: (
            _input: unknown,
            options: Pick<UseQueryOptions, "refetchInterval">,
          ) => {
            const query = useQuery(
              {
                queryKey: ["current-topics"],
                queryFn: state.fetchResults,
                ...options,
                enabled: state.queryClient !== undefined,
              },
              state.queryClient ?? idleClient,
            );
            return state.queryClient
              ? query
              : { data: state.data, refetch: vi.fn() };
          },
        },
        inspect: { useQuery: state.inspect },
      },
    },
  };
});
vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JSONView: ({ json }: { json: unknown }) => <pre>{JSON.stringify(json)}</pre>,
}));
vi.mock("./TopicEmbeddingMap", () => ({
  topicColor: () => "#000",
  TopicEmbeddingMap: ({
    headerActions,
    onSelectTrace,
  }: {
    headerActions?: ReactNode;
    onSelectTrace?: (traceId: string | null) => void;
  }) => (
    <div>
      {headerActions}
      <button onClick={() => onSelectTrace?.("trace-25")}>
        Select map trace
      </button>
      <button onClick={() => onSelectTrace?.(null)}>Deselect map trace</button>
    </div>
  ),
}));

describe("Current Topics", () => {
  afterEach(() => {
    state.queryClient?.clear();
    state.queryClient = undefined;
    vi.useRealTimers();
  });

  it("fetches results published after the last running poll, then stops polling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
    state.queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const facet = {
      facetId: "intent",
      name: "Intent",
      facetVersion: 1,
      rows: [],
      topics: [],
      map: null,
      awaitingCount: 0,
      usableCount: 0,
    };
    state.fetchResults.mockReset().mockResolvedValue([facet]);
    const view = render(
      <CurrentTopics projectId="project" running refreshAfter={Date.now()} />,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(state.fetchResults).toHaveBeenCalledOnce();
    expect(
      screen.getByText("No traces in this selection."),
    ).toBeInTheDocument();

    state.fetchResults.mockResolvedValue([
      {
        ...facet,
        rows: [
          {
            summaryId: "summary-a",
            traceId: "trace-a",
            summary: "Result published at completion",
            outcome: "not_applicable",
            topicId: null,
            topicName: null,
          },
        ],
      },
    ]);
    vi.setSystemTime(Date.now() + 1000);
    view.rerender(
      <CurrentTopics
        projectId="project"
        running={false}
        refreshAfter={Date.now()}
      />,
    );
    await act(() => vi.advanceTimersByTimeAsync(3001));
    expect(state.fetchResults).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("Result published at completion"),
    ).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(state.fetchResults).toHaveBeenCalledTimes(2);
  });

  it("switches facets, pages current traces, and separates cleared topic results from assigned membership", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      summaryId: `summary-${i}`,
      traceId: `trace-${i}`,
      summary: `Summary ${i}`,
      outcome: i === 20 ? "not_applicable" : "assigned",
      topicId: i === 20 ? null : "billing",
      topicName: i === 20 ? null : "Billing",
    }));
    state.data = [
      {
        facetId: "intent",
        name: "Intent",
        facetVersion: 2,
        rows,
        topics: [
          {
            id: "billing",
            name: "Billing",
            description: "Billing tasks",
            count: 20,
          },
        ],
        map: null,
        awaitingCount: 0,
        usableCount: 20,
      },
      {
        facetId: "issues",
        name: "Issues",
        facetVersion: 1,
        rows: [],
        topics: [],
        map: null,
        awaitingCount: 0,
        usableCount: 0,
      },
    ];
    const view = render(
      <CurrentTopics projectId="project" running={false} refreshAfter={0} />,
    );
    expect(screen.getByRole("tab", { name: "Intent" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Issues" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    fireEvent.click(screen.getByRole("button", { name: "trace-0" }));
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-0" } },
      undefined,
      { shallow: true },
    );
    fireEvent.click(
      screen.getByRole("row", { name: /trace-1 Billing Summary 1 Inspect/ }),
    );
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-1" } },
      undefined,
      { shallow: true },
    );
    state.inspect.mockImplementation(
      ({ summaryId }: { summaryId: string }) => ({
        data: { model: "summary-model", text: JSON.stringify([summaryId]) },
      }),
    );
    state.push.mockClear();
    expect(state.inspect).not.toHaveBeenCalled();
    fireEvent.click(
      within(
        screen.getByRole("row", { name: /trace-1 Billing Summary 1 Inspect/ }),
      ).getByRole("button", { name: "Inspect transcript" }),
    );
    const inspector = screen.getByRole("dialog", { name: "Summary source" });
    expect(state.inspect).toHaveBeenLastCalledWith({
      projectId: "project",
      summaryId: "summary-1",
    });
    expect(within(inspector).getByText('["summary-1"]')).toBeInTheDocument();
    expect(state.push).not.toHaveBeenCalled();
    fireEvent.click(
      within(inspector).getAllByRole("button", { name: "Close" })[0],
    );
    expect(screen.queryByRole("button", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(
      screen.getByRole("button", { name: "trace-20" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    expect(screen.queryByRole("button", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No topic (1)" }));
    const cleared = screen.getByRole("row", { name: /trace-20/ });
    expect(
      within(cleared).getByRole("button", { name: "trace-20" }),
    ).toBeInTheDocument();
    expect(within(cleared).getByText("Summary 20")).toBeInTheDocument();
    expect(within(cleared).getByText("not applicable")).toBeInTheDocument();
    expect(within(cleared).queryByText("Billing")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Issues" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("tabpanel", { name: "Issues" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No traces in this selection."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByRole("button", {
        name: /^trace-/,
      }),
    ).toBeNull();

    state.data = [...state.data].reverse();
    view.rerender(
      <CurrentTopics projectId="project" running={false} refreshAfter={0} />,
    );
    expect(screen.getByRole("tab", { name: "Issues" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    state.data = state.data.slice(1);
    view.rerender(
      <CurrentTopics projectId="project" running={false} refreshAfter={0} />,
    );
    expect(
      screen.getByRole("tabpanel", { name: "Intent" }),
    ).toBeInTheDocument();
  });
  it("only reveals mapped traces in the table when split, including across pages and conflicting filters", () => {
    state.push.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    const topics = [
      {
        id: "billing",
        name: "Billing",
        description: "Billing tasks",
        count: 25,
      },
    ];
    state.data = [
      {
        facetId: "intent",
        name: "Intent",
        facetVersion: 1,
        rows: Array.from({ length: 41 }, (_, i) => ({
          summaryId: `summary-${i}`,
          traceId: `trace-${i}`,
          summary: `Summary ${i}`,
          outcome: i < 25 ? "assigned" : "outlier",
          topicId: i < 25 ? "billing" : null,
          topicName: i < 25 ? "Billing" : null,
        })),
        topics,
        map: { runId: "run", topics },
        awaitingCount: 0,
        usableCount: 41,
      },
    ];
    render(
      <CurrentTopics projectId="project" running={false} refreshAfter={0} />,
    );
    const split = screen.getByRole("button", { name: "Split" });
    fireEvent.click(screen.getByRole("button", { name: "Select map trace" }));
    expect(screen.getByRole("row", { name: /trace-0 / })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /trace-25/ })).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    fireEvent.click(split);
    expect(split).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("row", { name: /trace-25/ })).toHaveClass(
      "topics-selected-trace",
    );
    expect(state.push).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    expect(screen.queryByRole("row", { name: /trace-25/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select map trace" }));
    const selectedRow = screen.getByRole("row", { name: /trace-25/ });
    expect(selectedRow).toHaveClass("topics-selected-trace");
    expect(state.push).not.toHaveBeenCalled();
    fireEvent.click(selectedRow);
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-25" } },
      undefined,
      { shallow: true },
    );
    fireEvent.click(screen.getByRole("button", { name: "Deselect map trace" }));
    expect(selectedRow).not.toHaveClass("topics-selected-trace");
  });
});
