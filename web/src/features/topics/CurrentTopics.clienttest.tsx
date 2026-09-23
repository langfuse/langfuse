import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrentTopics } from "./CurrentTopics";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  inspect: vi.fn(),
  fetchResults: vi.fn(),
  map: undefined as unknown,
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
vi.mock("@/src/utils/api", () => ({
  getPathnameWithoutBasePath: () => "/project/project/topics",
  api: {
    topics: {
      currentResults: { _def: () => ({ path: ["topics", "currentResults"] }) },
      map: { useQuery: () => ({ data: state.map }) },
      inspect: { useQuery: state.inspect },
    },
    useUtils: () => ({
      client: { topics: { currentResults: { query: state.fetchResults } } },
    }),
  },
}));
vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JSONView: ({ json }: { json: unknown }) => <pre>{JSON.stringify(json)}</pre>,
}));

let client: QueryClient;
const scrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  client.clear();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.useRealTimers();
});
function renderCurrent(
  props: ComponentProps<typeof CurrentTopics> = {
    projectId: "project",
    running: false,
    refreshAfter: 0,
  },
) {
  return render(<CurrentTopics {...props} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("Current Topics", () => {
  it("fetches final results while an old poll is in flight, then stops polling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
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
    const view = renderCurrent({
      projectId: "project",
      running: true,
      refreshAfter: Date.now(),
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(state.fetchResults).toHaveBeenCalledOnce();
    expect(
      screen.getByText("No traces in this selection."),
    ).toBeInTheDocument();

    let finishOldPoll: ((rows: (typeof facet)[]) => void) | undefined;
    state.fetchResults.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldPoll = resolve;
        }),
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(state.fetchResults).toHaveBeenCalledTimes(2);

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
    await act(async () => {
      finishOldPoll?.([facet]);
    });
    await act(() => vi.advanceTimersByTimeAsync(3001));
    expect(state.fetchResults).toHaveBeenCalledTimes(3);
    expect(
      screen.getByText("Result published at completion"),
    ).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(state.fetchResults).toHaveBeenCalledTimes(3);

    await act(async () => {
      await client.invalidateQueries({
        queryKey: [
          ["topics", "currentResults"],
          { input: { projectId: "project" }, type: "query" },
        ],
      });
    });
    expect(state.fetchResults).toHaveBeenCalledTimes(4);
  });

  it("switches facets, filters current traces and inspects a summary without opening peek", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      summaryId: `summary-${i}`,
      traceId: `trace-${i}`,
      summary: `Summary ${i}`,
      outcome: i === 20 ? "not_applicable" : "assigned",
      topicId: i === 20 ? null : "billing",
      topicName: i === 20 ? null : "Billing",
    }));
    state.fetchResults.mockResolvedValue([
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
    ]);
    renderCurrent();
    await screen.findByRole("link", { name: "trace-0" });
    fireEvent.click(screen.getByRole("link", { name: "trace-0" }));
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
    expect(screen.queryByRole("link", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByRole("link", { name: "trace-20" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      21,
    );
    expect(screen.queryByRole("link", { name: "trace-20" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "No topic (1)" }));
    const cleared = screen.getByRole("row", { name: /trace-20/ });
    expect(within(cleared).queryByText("Billing")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Issues" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("tabpanel", { name: "Issues" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).queryByRole("button", {
        name: /^trace-/,
      }),
    ).toBeNull();
  });
  it("keeps map selection pinned and reveals it across pages and conflicting current memberships", async () => {
    const topics = [
      {
        id: "billing",
        name: "Billing",
        description: "Billing tasks",
        count: 25,
      },
    ];
    state.fetchResults.mockResolvedValue([
      {
        facetId: "intent",
        name: "Intent",
        facetVersion: 1,
        rows: Array.from({ length: 26 }, (_, i) => ({
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
        usableCount: 26,
      },
    ]);
    state.map = {
      status: "ready",
      runId: "run",
      missingSummaryCount: 0,
      unpositionedCount: 0,
      // Saved map membership can differ from a trace's current assignment.
      points: [25, 0, 1].map((i) => ({
        traceId: `trace-${i}`,
        summary: `Mapped summary ${i}`,
        x: i,
        y: i % 2,
        topicId: i === 1 ? null : "billing",
        outcome: i === 1 ? "outlier" : "assigned",
      })),
    };
    renderCurrent();
    const point = await screen.findByRole("button", {
      name: "trace-25: Mapped summary 25",
    });
    const other = screen.getByRole("button", {
      name: "trace-0: Mapped summary 0",
    });
    const outlier = screen.getByRole("button", {
      name: "trace-1: Mapped summary 1",
    });
    fireEvent.mouseEnter(point);
    expect(point).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(point);
    fireEvent.mouseLeave(point);
    fireEvent.mouseEnter(other);
    expect(screen.getByText("Mapped summary 25")).toBeInTheDocument();
    expect(screen.queryByText("Mapped summary 0")).toBeNull();
    expect(screen.queryByRole("row", { name: /trace-25/ })).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "trace-25" }));
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-25" } },
      undefined,
      { shallow: true },
    );
    state.push.mockClear();
    fireEvent.keyDown(point, { key: "ArrowRight" });
    expect(document.activeElement).toBe(other);
    fireEvent.keyDown(other, { key: "ArrowRight" });
    expect(document.activeElement).toBe(outlier);
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByRole("row", { name: /trace-25/ })).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    expect(screen.queryByRole("row", { name: /trace-25/ })).toBeNull();
    expect(outlier).not.toBeInTheDocument();
    expect(point).toHaveAttribute("aria-pressed", "false");
    expect(point).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(point, { key: "Enter" });
    const selectedRow = screen.getByRole("row", { name: /trace-25/ });
    expect(point).toHaveAttribute("aria-pressed", "true");
    expect(state.push).not.toHaveBeenCalled();
    fireEvent.click(selectedRow);
    expect(state.push).toHaveBeenLastCalledWith(
      { pathname: "/project/project/topics", query: { peek: "trace-25" } },
      undefined,
      { shallow: true },
    );
    fireEvent.keyDown(point, { key: " " });
    expect(point).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /Billing tasks/ }));
    fireEvent.click(screen.getByRole("button", { name: "All topics" }));
    expect(
      screen.getByRole("button", { name: "trace-1: Mapped summary 1" }),
    ).toBeInTheDocument();
  });
});
