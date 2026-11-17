import { act, renderHook } from "@testing-library/react";
import { encodeFiltersGeneric } from "@langfuse/shared";
import { type ParsedUrlQuery } from "querystring";
import type * as QueryParams from "use-query-params";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { useAgentsScope } from "./useAgentsScope";

const router = vi.hoisted(() => ({
  pathname: "/project/[projectId]/agents",
  query: {} as ParsedUrlQuery,
  isReady: true,
  replace: vi.fn(),
}));
const sharedDate = vi.hoisted(() => ({
  timeRange: { range: "last7Days" } as TimeRange,
  setTimeRange: vi.fn(),
}));
const setPagination = vi.hoisted(() => vi.fn());

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("@/src/hooks/useTableDateRange", () => ({
  useTableDateRange: () => sharedDate,
}));
vi.mock("use-query-params", async (importOriginal) => ({
  ...(await importOriginal<typeof QueryParams>()),
  useQueryParams: () => [{}, setPagination],
}));

beforeEach(() => {
  router.query = { projectId: "project" };
  sharedDate.timeRange = { range: "last7Days" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Agent scope navigation", () => {
  it("uses the native environment filter, including aliases, and clearing removes the cohort restriction", () => {
    router.query.filter = encodeFiltersGeneric([
      {
        column: "Environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production", "staging"],
      },
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: ["preview"],
      },
    ]);
    const { result, rerender } = renderHook(() => useAgentsScope("project"));
    expect(result.current.scope.environment).toBeNull();
    expect(result.current.scope.environmentFilter).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production", "staging"],
      },
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: ["preview"],
      },
    ]);
    router.query.filter = "";
    rerender();
    expect(result.current.scope.environmentFilter).toEqual([]);
    expect(result.current.enabled).toBe(true);
  });

  it("refreshes a bounded relative window without changing the shared date selection", () => {
    const { result, rerender } = renderHook(() => useAgentsScope("project"));
    const first = result.current.scope;
    vi.advanceTimersByTime(60_000);
    rerender();
    expect(result.current.scope.to).toEqual(first.to);
    act(() => {
      expect(result.current.refreshWindow()).toBe(true);
    });
    expect(result.current.scope.to.getTime() - first.to.getTime()).toBe(60_000);
    expect(
      result.current.scope.to.getTime() - result.current.scope.from.getTime(),
    ).toBe(7 * 86400000);
    expect(result.current.timeRange).toEqual({ range: "last7Days" });
    sharedDate.timeRange = { from: first.from, to: first.to };
    rerender();
    expect(result.current.refreshWindow()).toBe(false);
  });

  it("anchors a newly chosen relative period to now and resets all activity pagination", () => {
    const { result } = renderHook(() => useAgentsScope("project"));
    vi.advanceTimersByTime(2 * 3600000);
    act(() => result.current.setTimeRange({ range: "last1Hour" }));
    expect(result.current.scope.to).toEqual(new Date("2026-11-06T14:00:00Z"));
    expect(sharedDate.setTimeRange).toHaveBeenLastCalledWith({
      range: "last1Hour",
    });
    expect(setPagination).toHaveBeenLastCalledWith({
      page: undefined,
      pageIndex: undefined,
      skillPage: undefined,
    });
  });

  it("blocks an unbounded shared range before querying the agent backend", () => {
    sharedDate.timeRange = { range: "allTime" };
    const { result } = renderHook(() => useAgentsScope("project"));
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toContain("30 days");
  });
});
