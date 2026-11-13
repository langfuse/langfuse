/**
 * Tests for the dashboard query scheduler and its reset-key contract.
 *
 * The scheduler re-queues every in-flight / completed widget whenever its
 * reset key changes (see `resetQueue`). The reset key must therefore depend
 * only on genuinely query-affecting params (time range, filters, environment)
 * and NOT on the set of widgets present — otherwise adding a widget re-runs
 * every sibling, which on the SSE path blanks already-rendered charts.
 */
import { act, render, renderHook, screen } from "@testing-library/react";
import { createElement } from "react";
import { api } from "@/src/utils/api";
import {
  getDashboardSchedulerResetKey,
  useDashboardQueryScheduler,
  useScheduledDashboardExecuteQuery,
} from "@/src/features/dashboard/hooks/DashboardQuerySchedulerProvider";
import { type DashboardQuerySchedulerStore } from "@/src/features/dashboard/stores/dashboardQuerySchedulerStore";

const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }));
vi.mock("@/src/utils/trpcErrorToast", () => ({ trpcErrorToast: errorToast }));

it.each([
  { surface: "widget", inline: true },
  { surface: "Home", inline: false },
])("handles resource-limit errors on $surface", async ({ inline }) => {
  errorToast.mockClear();
  const message = "The query result is too large. Try a shorter date range.";
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            json: {
              message,
              code: -32600,
              data: {
                code: "UNPROCESSABLE_CONTENT",
                httpStatus: 422,
                path: "dashboard.executeQuery",
                errorName: "ClickHouseResourceError",
              },
            },
          },
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      ),
  );
  const Page = api.withTRPC(() => {
    const result = useScheduledDashboardExecuteQuery(
      {
        projectId: "project-1",
        version: "v1",
        query: {
          view: "traces",
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2026-01-01T00:00:00.000Z",
          toTimestamp: "2026-01-02T00:00:00.000Z",
          orderBy: null,
        },
      },
      {
        queryId: "inline-error:test",
        meta: inline ? { silentHttpCodes: [412, 422] } : undefined,
      },
    );
    return createElement("div", null, result.error);
  });

  try {
    render(createElement(Page));
    await screen.findByText(message);
    expect(errorToast).toHaveBeenCalledTimes(inline ? 0 : 1);
  } finally {
    fetchMock.mockRestore();
  }
});

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
    // id list, which would re-queue every sibling on "Add Widget".
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
  const canFetch = (store: DashboardQuerySchedulerStore, id: string) =>
    store.getState().items[id]?.status === "running";

  // Characterizes `register`'s incremental behavior (a new id is inserted as
  // `queued` and scheduled without iterating existing items). This is the
  // property the reset-key contract relies on (register never touched
  // siblings, pre- or post-fix). The regression guard for the add-a-widget
  // bug is the getDashboardSchedulerResetKey composition test above.
  it("schedules a newly registered widget without touching done siblings", () => {
    const { result } = renderHook(() =>
      useDashboardQueryScheduler({ maxConcurrent: 2, resetKey: "k1" }),
    );
    const { actions } = result.current.getState();

    act(() => {
      actions.register("w1", 1);
      actions.register("w2", 2);
    });

    // Both promoted (maxConcurrent = 2) then completed.
    act(() => {
      actions.markDone("w1");
      actions.markDone("w2");
    });

    expect(canFetch(result.current, "w1")).toBe(false);
    expect(canFetch(result.current, "w2")).toBe(false);

    // "Add Widget": a brand-new placement registers and schedules on its own.
    act(() => {
      actions.register("w3", 3);
    });

    expect(canFetch(result.current, "w3")).toBe(true);
    // The done siblings must stay done — never re-queued/re-run.
    expect(canFetch(result.current, "w1")).toBe(false);
    expect(canFetch(result.current, "w2")).toBe(false);
  });

  it("re-queues completed widgets when the reset key changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) =>
        useDashboardQueryScheduler({ maxConcurrent: 5, resetKey }),
      { initialProps: { resetKey: "k1" } },
    );
    const { actions } = result.current.getState();

    act(() => {
      actions.register("w1", 1);
    });
    act(() => {
      actions.markDone("w1");
    });

    expect(canFetch(result.current, "w1")).toBe(false);

    // A genuine query-param change (new reset key) must refresh everything.
    rerender({ resetKey: "k2" });

    expect(canFetch(result.current, "w1")).toBe(true);
  });

  it("holds queued widgets until a running slot frees, in priority order", () => {
    const { result } = renderHook(() =>
      useDashboardQueryScheduler({ maxConcurrent: 1, resetKey: "k1" }),
    );
    const { actions } = result.current.getState();

    act(() => {
      actions.register("late", 10);
      actions.register("early", 1);
    });

    // One slot: "late" grabbed it on registration; "early" waits.
    expect(canFetch(result.current, "late")).toBe(true);
    expect(canFetch(result.current, "early")).toBe(false);

    // Slot frees on ANY completion path (done or unmount) — the waiter with
    // the lowest priority value runs next.
    act(() => {
      actions.markDone("late");
    });
    expect(canFetch(result.current, "early")).toBe(true);

    act(() => {
      actions.register("next", 5);
      actions.unregister("early");
    });
    expect(canFetch(result.current, "next")).toBe(true);
  });
});
