import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { __test } from "./CurrentTopics";
import {
  type TopicTraceQuery,
  type TopicTracesResult,
  useTracesWithSelection,
} from "./facet-topics";

const { fetchResults, resetTraces } = vi.hoisted(() => ({
  fetchResults: vi.fn(),
  resetTraces: vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      currentResults: { _def: () => ({ path: ["topics", "currentResults"] }) },
    },
    useUtils: () => ({
      client: { topics: { currentResults: { query: fetchResults } } },
      topics: { traces: { reset: resetTraces } },
    }),
  },
}));

const timeRange = {
  from: new Date("2026-09-16T00:00:00Z"),
  to: new Date("2026-09-23T00:00:00Z"),
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
    resetTraces.mockReset();
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
    expect(resetTraces).not.toHaveBeenCalled();

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
    expect(resetTraces).toHaveBeenCalledOnce();

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
    expect(resetTraces).toHaveBeenCalledOnce();
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

describe("trace selection", () => {
  const row = (traceId: string) => ({
    traceId,
    unitStartTime: timeRange.from.toISOString(),
    facetVersion: 1,
    summary: "",
    outcome: "assigned" as const,
    topicId: null,
    topicName: null,
  });
  const loaded = ["newest", "older"];
  const fakeTraces = (query: TopicTraceQuery | null): TopicTracesResult => ({
    rows:
      query === null ? [] : (query.traceId ? [query.traceId] : loaded).map(row),
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    loadMore: () => undefined,
  });
  const listed = (query: TopicTraceQuery, selected: string | null) =>
    renderHook(() =>
      useTracesWithSelection(fakeTraces, query, selected),
    ).result.current.rows.map((item) => item.traceId);

  it("pins a selection outside the loaded pages unless a trace ID is searched", () => {
    expect(listed({}, "older")).toEqual(["newest", "older"]);
    expect(listed({}, "picked")).toEqual(["picked", "newest", "older"]);
    expect(listed({ traceId: "searched" }, "picked")).toEqual(["searched"]);
  });
});
