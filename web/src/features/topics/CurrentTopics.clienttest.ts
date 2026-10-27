import { type ComponentProps, createElement, type ReactNode } from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrentTopics, __test } from "./CurrentTopics";

const { fetchResults } = vi.hoisted(() => ({ fetchResults: vi.fn() }));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      currentResults: { _def: () => ({ path: ["topics", "currentResults"] }) },
      map: { useQuery: () => ({ data: undefined }) },
    },
    useUtils: () => ({
      client: { topics: { currentResults: { query: fetchResults } } },
    }),
  },
}));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({ openPeek: vi.fn() }),
}));
vi.mock("@/src/hooks/use-mobile", () => ({ useIsHandheld: () => false }));
vi.mock("./TopicGridView", () => ({
  TopicGridView: ({ facet }: { facet: { name: string } }) =>
    createElement("p", null, `${facet.name} grid`),
}));

const timeRange = {
  from: new Date("2026-09-16T00:00:00Z"),
  to: new Date("2026-09-23T00:00:00Z"),
};
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
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

describe("current Topics query", () => {
  it("fetches final results while an old poll is in flight, then stops polling", async () => {
    fetchResults
      .mockReset()
      .mockResolvedValue({ hasStoredSummaries: false, facets: [facet] });
    const props = {
      projectId: "project",
      running: true,
      refreshAfter: Date.now(),
      timeRange,
    };
    const view = renderHook(__test.useCurrentTopics, {
      initialProps: props,
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchResults).toHaveBeenCalledOnce();
    expect(view.result.current.data).toEqual({
      hasStoredSummaries: false,
      facets: [facet],
    });

    let finishOldPoll:
      | ((rows: {
          hasStoredSummaries: boolean;
          facets: (typeof facet)[];
        }) => void)
      | undefined;
    fetchResults.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOldPoll = resolve;
        }),
    );
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(fetchResults).toHaveBeenCalledTimes(2);

    const completed = [
      {
        ...facet,
        rows: [
          {
            facetVersion: 1,
            traceId: "trace-a",
            unitStartTime: timeRange.from.toISOString(),
            summary: "Result published at completion",
            outcome: "not_applicable",
            topicId: null,
            topicName: null,
          },
        ],
      },
    ];
    fetchResults.mockResolvedValue({
      hasStoredSummaries: true,
      facets: completed,
    });
    vi.setSystemTime(Date.now() + 1000);
    view.rerender({ ...props, running: false, refreshAfter: Date.now() });
    await act(async () => {
      finishOldPoll?.({ hasStoredSummaries: false, facets: [facet] });
    });
    await act(() => vi.advanceTimersByTimeAsync(3001));
    expect(fetchResults).toHaveBeenCalledTimes(3);
    expect(view.result.current.data).toEqual({
      hasStoredSummaries: true,
      facets: completed,
    });

    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(fetchResults).toHaveBeenCalledTimes(3);

    await act(async () => {
      await client.invalidateQueries({
        queryKey: [
          ["topics", "currentResults"],
          { input: { projectId: "project" }, type: "query" },
        ],
      });
    });
    expect(fetchResults).toHaveBeenCalledTimes(4);
  });
  it("polls waiting automatic processing at ten seconds and stops once ready", async () => {
    fetchResults
      .mockReset()
      .mockResolvedValue({ hasStoredSummaries: false, facets: [] });
    renderHook(__test.useCurrentTopics, {
      initialProps: {
        projectId: "project",
        running: false,
        pollForSummaries: true,
        refreshAfter: 0,
        timeRange,
      },
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchResults).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(fetchResults).toHaveBeenCalledOnce();
    fetchResults.mockResolvedValue({ hasStoredSummaries: true, facets: [] });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchResults).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(30000));
    expect(fetchResults).toHaveBeenCalledTimes(2);
  });
});

describe("current Topics loader", () => {
  it("hands over to results in the render that receives them, with no timer", () => {
    const props = {
      projectId: "project",
      timeRange,
      selectedFacetId: "intent",
      view: "grid",
      traceFilters: {} as ComponentProps<typeof CurrentTopics>["traceFilters"],
      onGenerateTopics: vi.fn(),
      canGenerateTopics: false,
    } as const;
    const view = render(
      createElement(CurrentTopics, {
        ...props,
        result: { data: undefined, isLoading: true, error: null },
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Loading topics ..." }),
    ).toBeInTheDocument();

    view.rerender(
      createElement(CurrentTopics, {
        ...props,
        result: {
          data: { hasStoredSummaries: true, facets: [facet] },
          isLoading: false,
          error: null,
        },
      }),
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Intent grid")).toBeInTheDocument();
  });
});
