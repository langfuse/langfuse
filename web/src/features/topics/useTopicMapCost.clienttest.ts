import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTopicMapCost } from "./useTopicMapCost";

const { fetchCost } = vi.hoisted(() => ({ fetchCost: vi.fn() }));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: { mapCost: { _def: () => ({ path: ["topics", "mapCost"] }) } },
    useUtils: () => ({
      client: { topics: { mapCost: { query: fetchCost } } },
    }),
  },
}));

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

it("requests the settled cost when the map's run completes, keeping it while the map refreshes", async () => {
  // A running analysis has no completed map yet, so nothing is priced.
  fetchCost.mockReset().mockResolvedValue(null);
  const props = {
    projectId: "project",
    analysisId: "analysis",
    running: true,
    refreshAfter: 1,
  };
  const view = renderHook(useTopicMapCost, {
    initialProps: props,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(view.result.current).toBeNull();

  fetchCost.mockResolvedValue(0.42);
  view.rerender({ ...props, running: false, refreshAfter: 2 });
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(view.result.current).toBe(0.42);

  let finish: ((cost: number) => void) | undefined;
  fetchCost.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  view.rerender({ ...props, running: false, refreshAfter: 3 });
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(view.result.current).toBe(0.42);
  await act(async () => {
    finish?.(0.5);
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(view.result.current).toBe(0.5);

  fetchCost.mockImplementationOnce(() => new Promise(() => {}));
  view.rerender({ ...props, analysisId: "other", refreshAfter: 3 });
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(view.result.current).toBeNull();
});
