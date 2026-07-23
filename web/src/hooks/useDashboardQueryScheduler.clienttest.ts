/**
 * Tests for the dashboard query scheduler and its reset-key contract.
 *
 * The scheduler re-queues every in-flight / completed widget whenever its
 * reset key changes (see `resetQueue`). The reset key must therefore depend
 * only on genuinely query-affecting params (time range, filters, environment)
 * and NOT on the set of widgets present — otherwise adding a widget re-runs
 * every sibling, which on the SSE path blanks already-rendered charts
 * (LFE-10986).
 */
import { act, renderHook } from "@testing-library/react";
import {
  getDashboardSchedulerResetKey,
  useDashboardQueryScheduler,
} from "@/src/hooks/useDashboardQueryScheduler";

describe("getDashboardSchedulerResetKey", () => {
  const base = {
    projectId: "project-1",
    dashboardId: "dashboard-1",
    fromIso: "2026-01-01T00:00:00.000Z",
    toIso: "2026-01-08T00:00:00.000Z",
    filters: [] as unknown[],
    environments: ["default"],
  };

  it("is composed of only query-affecting params (never the widget set)", () => {
    // Pinning the exact composition guards against re-introducing the widget
    // id list, which would re-queue every sibling on "Add Widget" (LFE-10986).
    expect(getDashboardSchedulerResetKey(base)).toBe(
      "project-1|dashboard-1|2026-01-01T00:00:00.000Z|2026-01-08T00:00:00.000Z|[]|default",
    );
  });

  it("changes when the time range changes", () => {
    expect(
      getDashboardSchedulerResetKey({
        ...base,
        toIso: "2026-02-01T00:00:00.000Z",
      }),
    ).not.toBe(getDashboardSchedulerResetKey(base));
  });

  it("changes when the filters change", () => {
    expect(
      getDashboardSchedulerResetKey({
        ...base,
        filters: [{ column: "name", operator: "=", value: "x" }],
      }),
    ).not.toBe(getDashboardSchedulerResetKey(base));
  });

  it("changes when the environment selection changes", () => {
    expect(
      getDashboardSchedulerResetKey({
        ...base,
        environments: ["default", "prod"],
      }),
    ).not.toBe(getDashboardSchedulerResetKey(base));
  });
});

describe("useDashboardQueryScheduler", () => {
  // Characterizes `register`'s incremental behavior (a new id is inserted as
  // `queued` and scheduled without iterating existing items). This is the
  // property the reset-key fix relies on — not itself a guard for LFE-10986
  // (register never touched siblings, pre- or post-fix). The regression guard
  // for the bug is the getDashboardSchedulerResetKey composition test above.
  it("schedules a newly registered widget without touching done siblings", () => {
    const { result } = renderHook(() =>
      useDashboardQueryScheduler({ maxConcurrent: 2, resetKey: "k1" }),
    );

    act(() => {
      result.current.register("w1", 1);
      result.current.register("w2", 2);
    });

    // Both promoted (maxConcurrent = 2) then completed.
    act(() => {
      result.current.markDone("w1");
      result.current.markDone("w2");
    });

    expect(result.current.canFetch("w1")).toBe(false);
    expect(result.current.canFetch("w2")).toBe(false);

    // "Add Widget": a brand-new placement registers and schedules on its own.
    act(() => {
      result.current.register("w3", 3);
    });

    expect(result.current.canFetch("w3")).toBe(true);
    // The done siblings must stay done — never re-queued/re-run.
    expect(result.current.canFetch("w1")).toBe(false);
    expect(result.current.canFetch("w2")).toBe(false);
  });

  it("re-queues completed widgets when the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useDashboardQueryScheduler({ maxConcurrent: 5, resetKey }),
      { initialProps: { resetKey: "k1" } },
    );

    act(() => {
      result.current.register("w1", 1);
    });
    act(() => {
      result.current.markDone("w1");
    });

    expect(result.current.canFetch("w1")).toBe(false);

    // A genuine query-param change (new reset key) must refresh everything.
    rerender({ resetKey: "k2" });

    expect(result.current.canFetch("w1")).toBe(true);
  });
});
