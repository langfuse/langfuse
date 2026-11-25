import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SETUP_STATUS_POLL_MS,
  useTopicRuleSetupStatus,
} from "./useTopicRuleSetupStatus";

const { fetchStatus, invalidateMaps, invalidateResults, queries } = vi.hoisted(
  () => ({
    fetchStatus: vi.fn(),
    invalidateMaps: vi.fn(),
    invalidateResults: vi.fn(),
    queries: { client: undefined as unknown as QueryClient },
  }),
);
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      ruleSetupStatus: {
        _def: () => ({ path: ["topics", "ruleSetupStatus"] }),
      },
    },
    useUtils: () => ({
      client: { topics: { ruleSetupStatus: { query: fetchStatus } } },
      topics: {
        ruleSetupStatus: {
          getData: () => queries.client.getQueryCache().getAll()[0]?.state.data,
        },
        maps: { invalidate: invalidateMaps },
        currentResults: { invalidate: invalidateResults },
      },
    }),
  },
}));

const status = (phase: string) => ({ phase, facets: [], seededCount: 10 });

beforeEach(() => {
  vi.useFakeTimers();
  queries.client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});
afterEach(() => {
  queries.client.clear();
  vi.useRealTimers();
});

it("refetches maps and results once when a running setup finishes", async () => {
  fetchStatus.mockImplementation(async () => {
    const next = fetchStatus.mock.calls.length > 1 ? "done" : "summarizing";
    return status(next);
  });
  const view = renderHook(
    () => useTopicRuleSetupStatus({ projectId: "project", ruleId: "rule" }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client: queries.client },
          children,
        ),
    },
  );
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(invalidateMaps).not.toHaveBeenCalled();

  await act(() => vi.advanceTimersByTimeAsync(SETUP_STATUS_POLL_MS));
  expect(invalidateMaps).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
  });
  expect(invalidateResults).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
  });

  await act(() => vi.advanceTimersByTimeAsync(2 * SETUP_STATUS_POLL_MS));
  expect(view.result.current.data).toEqual(status("done"));
  expect(fetchStatus).toHaveBeenCalledTimes(2);
});
