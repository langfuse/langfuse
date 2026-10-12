import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { __test } from "./CurrentTopics";

const { fetchResults } = vi.hoisted(() => ({ fetchResults: vi.fn() }));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      currentResults: { _def: () => ({ path: ["topics", "currentResults"] }) },
    },
    useUtils: () => ({
      client: { topics: { currentResults: { query: fetchResults } } },
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
    fetchResults.mockReset().mockResolvedValue([facet]);
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
    expect(view.result.current.data).toEqual([facet]);

    let finishOldPoll: ((rows: (typeof facet)[]) => void) | undefined;
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
    fetchResults.mockResolvedValue(completed);
    vi.setSystemTime(Date.now() + 1000);
    view.rerender({ ...props, running: false, refreshAfter: Date.now() });
    await act(async () => {
      finishOldPoll?.([facet]);
    });
    await act(() => vi.advanceTimersByTimeAsync(3001));
    expect(fetchResults).toHaveBeenCalledTimes(3);
    expect(view.result.current.data).toEqual(completed);

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
});
