import { createElement, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CurrentTopics, __test } from "./CurrentTopics";
import { type Facet } from "./facet-topics";

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
vi.mock("@/src/hooks/use-mobile", () => ({ useIsHandheld: () => true }));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: false }),
}));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({ openPeek: vi.fn() }),
}));
vi.mock("./MobileTopicsView", () => ({
  MobileTopicsView: ({
    selectedTraceId,
    onSelectTrace,
  }: {
    selectedTraceId: string | null;
    onSelectTrace: (traceId: string) => void;
  }) =>
    createElement(
      "button",
      { onClick: () => onSelectTrace("trace-a") },
      selectedTraceId ?? "No trace selected",
    ),
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
  cleanup();
  sessionStorage.clear();
  client.clear();
  vi.useRealTimers();
});

it("clears mobile trace selection on facet changes while preserving it on refresh", () => {
  sessionStorage.setItem("topics-selected-trace:project", '"desktop-trace"');
  const facet: Facet = {
    facetId: "intent",
    name: "Intent",
    facetVersion: 1,
    topics: [],
    rows: [],
    map: null,
    awaitingCount: 0,
    usableCount: 0,
  };
  const props = {
    projectId: "project",
    timeRange,
    result: {
      data: {
        facets: [facet, { ...facet, facetId: "issues" }],
        hasStoredSummaries: true as const,
      },
      isLoading: false,
      error: null,
    },
    selectedFacetId: "intent",
    view: "map" as const,
    traceFilters: {
      selectedFacetId: "intent",
      selectFacet: vi.fn(),
      filters: [],
      searchQuery: null,
      setFilters: vi.fn(),
      setSearchQuery: vi.fn(),
    },
    onGenerateTopics: vi.fn(),
    canGenerateTopics: false,
  };
  const view = render(createElement(CurrentTopics, props));
  const selection = screen.getByRole("button", { name: "No trace selected" });
  fireEvent.click(selection);
  expect(selection).toHaveTextContent("trace-a");
  view.rerender(
    createElement(CurrentTopics, {
      ...props,
      result: {
        ...props.result,
        data: {
          ...props.result.data,
          facets: props.result.data.facets.map((facet) => ({ ...facet })),
        },
      },
    }),
  );
  expect(selection).toHaveTextContent("trace-a");
  view.rerender(
    createElement(CurrentTopics, { ...props, selectedFacetId: "issues" }),
  );
  expect(selection).toHaveTextContent("No trace selected");
  view.rerender(createElement(CurrentTopics, props));
  expect(selection).toHaveTextContent("No trace selected");
  expect(sessionStorage.getItem("topics-selected-trace:project")).toBe(
    '"desktop-trace"',
  );
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
