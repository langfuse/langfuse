import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";

const { mockPush, mockPathname, capture } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPathname: { value: "/project/[projectId]/traces" },
  capture: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush, pathname: mockPathname.value }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

// expandPeek builds the standalone-page path from `expandConfig.pathParam`.
// The trace reader's expand must survive both peek URL dialects (LFE-11041):
// v4 URLs put the trace id in `traceId`, v3 URLs put it in `peek`.
describe("usePeekNavigation expandPeek", () => {
  const config = {
    queryParams: ["observation", "display", "timestamp", "traceId"],
    tableName: "traces",
    isV4: false,
    expandConfig: {
      basePath: "/project/p1/traces",
      pathParam: "traceId",
      reader: "trace" as const,
    },
  };

  beforeEach(() => {
    mockPush.mockReset();
    capture.mockReset();
    mockPathname.value = "/project/[projectId]/traces";
  });

  it("v4-dialect URL: expands to the traceId param, not the observation id in peek", () => {
    window.history.replaceState(
      {},
      "",
      "/project/p1/traces?peek=obs-uuid&observation=obs-uuid&traceId=trace-1&timestamp=2026-07-14T19%3A47%3A57.703Z",
    );

    const { result } = renderHook(() => usePeekNavigation(config));
    result.current.expandPeek(false);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const target = mockPush.mock.calls[0][0] as string;
    expect(target.startsWith("/project/p1/traces/trace-1?")).toBe(true);
  });

  it("v4-dialect URL: does not forward the observation startTime as the trace timestamp", () => {
    // The timestamp on a v4-dialect URL is the observation's startTime; the
    // standalone page would use it as the trace-timestamp lookup filter
    // (day-equality) and observation-window anchor — 404s / truncated trees
    // on long traces (LFE-10947 class).
    window.history.replaceState(
      {},
      "",
      "/project/p1/traces?peek=obs-uuid&observation=obs-uuid&traceId=trace-1&timestamp=2026-07-14T19%3A47%3A57.703Z",
    );

    const { result } = renderHook(() => usePeekNavigation(config));
    result.current.expandPeek(false);

    const target = mockPush.mock.calls[0][0] as string;
    expect(target).not.toContain("timestamp=");
    expect(target).toContain("observation=obs-uuid");
  });

  it("v3-dialect URL (no traceId param): falls back to peek for the path segment and keeps the trace timestamp", () => {
    window.history.replaceState(
      {},
      "",
      "/project/p1/traces?peek=trace-1&timestamp=2026-07-14T19%3A47%3A57.703Z",
    );

    const { result } = renderHook(() => usePeekNavigation(config));
    result.current.expandPeek(false);

    expect(mockPush).toHaveBeenCalledTimes(1);
    const target = mockPush.mock.calls[0][0] as string;
    expect(target.startsWith("/project/p1/traces/trace-1?")).toBe(true);
    expect(
      new URL(target, window.location.origin).searchParams.get("timestamp"),
    ).toBe("2026-07-14T19:47:57.703Z");
  });

  it("without a reader, expand forwards params verbatim (non-trace peeks unchanged)", () => {
    window.history.replaceState(
      {},
      "",
      "/project/p1/traces?peek=obs-uuid&traceId=trace-1&timestamp=2026-07-14T19%3A47%3A57.703Z",
    );

    const { result } = renderHook(() =>
      usePeekNavigation({
        ...config,
        expandConfig: {
          basePath: "/project/p1/traces",
          pathParam: "traceId",
        },
      }),
    );
    result.current.expandPeek(false);

    const target = mockPush.mock.calls[0][0] as string;
    expect(target.startsWith("/project/p1/traces/trace-1?")).toBe(true);
    expect(target).toContain("timestamp=");
  });

  it("forwards stacked detail state as one query parameter", () => {
    const search = "peek=trace-1&observation=observation-1&aggregation=trace";
    const params = new URLSearchParams({
      peek: "session-1",
      traceView: "messages",
      sessionPeek: search,
      traceFilter: '[{"column":"name"}]',
      tracesWithoutMatches: "hide",
      sessionView: "list",
    });
    window.history.replaceState({}, "", `/project/p1/sessions?${params}`);
    const { result } = renderHook(() =>
      usePeekNavigation({
        tableName: "sessions",
        isV4: true,
        queryParams: [
          "traceView",
          "sessionPeek",
          "traceFilter",
          "tracesWithoutMatches",
          "sessionView",
        ],
        expandConfig: { basePath: "/project/p1/sessions" },
      }),
    );
    result.current.expandPeek(false);
    const target = new URL(
      String(mockPush.mock.lastCall?.[0]),
      window.location.origin,
    );
    expect(target.pathname).toBe("/project/p1/sessions/session-1");
    expect(target.searchParams.get("sessionPeek")).toBe(search);
    expect(target.searchParams.get("traceView")).toBe("messages");
    expect(target.searchParams.get("traceFilter")).toBe('[{"column":"name"}]');
    expect(target.searchParams.get("tracesWithoutMatches")).toBe("hide");
    expect(target.searchParams.get("sessionView")).toBe("list");
    expect(target.searchParams.has("observation")).toBe(false);
  });

  it.each([false, true])(
    "encodes arbitrary session IDs when expanding (new tab: %s)",
    (newTab) => {
      const id = "chat/1?#50% space";
      window.history.replaceState(
        {},
        "",
        `/project/p1/sessions?${new URLSearchParams({ peek: id })}`,
      );
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      try {
        const { result } = renderHook(() =>
          usePeekNavigation({
            tableName: "sessions",
            isV4: true,
            expandConfig: { basePath: "/project/p1/sessions" },
          }),
        );
        result.current.expandPeek(newTab);

        const target = String(
          newTab ? open.mock.lastCall?.[0] : mockPush.mock.lastCall?.[0],
        );
        expect(new URL(target, window.location.origin).pathname).toBe(
          `/project/p1/sessions/${encodeURIComponent(id)}`,
        );
      } finally {
        open.mockRestore();
      }
    },
  );
});

describe("usePeekNavigation detail state cleanup", () => {
  beforeEach(() => {
    mockPush.mockReset();
    window.history.replaceState(
      {},
      "",
      "/project/p1/sessions?peek=session-a&sessionPeek=peek%3Dtrace-a&observation=obs-a&filter=keep&traceView=messages&sessionView=list&traceFilter=working&tracesWithoutMatches=hide",
    );
  });

  it.each([undefined, { observation: "obs-b" }])(
    "clears old detail state before applying entry params: %j",
    (params) => {
      const { result } = renderHook(() =>
        usePeekNavigation({
          tableName: "sessions",
          isV4: true,
          queryParams: [
            "observation",
            "traceView",
            "sessionView",
            "traceFilter",
            "tracesWithoutMatches",
          ],
          preserveOnDetailNavigation: [
            "traceView",
            "sessionView",
            "traceFilter",
            "tracesWithoutMatches",
          ],
        }),
      );
      const target = new URL(
        result.current.resolveDetailNavigationPath({ id: "session-b", params }),
        window.location.origin,
      );

      expect(Object.fromEntries(target.searchParams)).toEqual({
        peek: "session-b",
        filter: "keep",
        traceView: "messages",
        sessionView: "list",
        traceFilter: "working",
        tracesWithoutMatches: "hide",
        ...(params ?? {}),
      });
    },
  );

  it.each(["close", "open", "toggle-close"] as const)(
    "clears nested trace state on %s even without configured params",
    (action) => {
      const { result } = renderHook(() =>
        usePeekNavigation({ tableName: "traces", isV4: true }),
      );
      if (action === "close") result.current.closePeek();
      if (action === "open") result.current.openPeek("trace-b");
      if (action === "toggle-close") result.current.openPeek();

      const target = mockPush.mock.lastCall?.[0] as {
        query: Record<string, string>;
      };
      expect(target.query.sessionPeek).toBeUndefined();
      expect(target.query.peek).toBe(action === "open" ? "trace-b" : undefined);
      expect(target.query.filter).toBe("keep");
    },
  );
});

describe("usePeekNavigation analytics", () => {
  beforeEach(() => {
    mockPush.mockReset();
    capture.mockReset();
  });

  it("captures peek:opened once with tableName and surface isV4", () => {
    window.history.replaceState({}, "", "/project/p1/experiments/results");
    mockPathname.value = "/project/[projectId]/experiments/results";

    const { result } = renderHook(() =>
      usePeekNavigation({
        tableName: "experiment-items",
        isV4: true,
      }),
    );
    result.current.openPeek("item-1");

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("peek:opened", {
      routePattern: "/project/[projectId]/experiments/results",
      wasOpen: false,
      isV4: true,
      tableName: "experiment-items",
    });
    expect(JSON.stringify(capture.mock.calls[0][1])).not.toMatch(/item-1/);
  });

  it("uses the owning surface tableName and isV4 (v3 observations)", () => {
    window.history.replaceState({}, "", "/project/p1/observations");
    mockPathname.value = "/project/[projectId]/observations";

    const { result } = renderHook(() =>
      usePeekNavigation({
        tableName: "observations",
        isV4: false,
      }),
    );
    result.current.openPeek("obs-1");

    expect(capture).toHaveBeenCalledWith("peek:opened", {
      routePattern: "/project/[projectId]/observations",
      wasOpen: false,
      isV4: false,
      tableName: "observations",
    });
    expect(JSON.stringify(capture.mock.calls[0][1])).not.toMatch(/unknown/);
  });

  it("does not recapture when re-opening the same peeked row", () => {
    window.history.replaceState(
      {},
      "",
      "/project/p1/experiments/results?peek=item-1",
    );
    mockPathname.value = "/project/[projectId]/experiments/results";

    const { result } = renderHook(() =>
      usePeekNavigation({
        tableName: "experiment-items",
        isV4: true,
      }),
    );
    result.current.openPeek("item-1");

    expect(capture).not.toHaveBeenCalled();
  });
});

describe("peek entry parameters", () => {
  it.each(["closePeek", "openPeek"] as const)(
    "%s clears session scope even without a reader",
    (action) => {
      mockPush.mockReset();
      window.history.replaceState(
        {},
        "",
        "/project/p1/observations?peek=obs&aggregation=session&display=timeline",
      );
      const { result } = renderHook(() =>
        usePeekNavigation({
          tableName: "events",
          isV4: true,
          expandConfig: {
            basePath: "/project/p1/traces",
            pathParam: "traceId",
          },
        }),
      );
      result.current[action]();
      expect(mockPush.mock.lastCall?.[0].query).toEqual({
        display: "timeline",
      });
    },
  );

  it.each([false, true])(
    "forwards session scope without a reader (new tab: %s)",
    (newTab) => {
      mockPush.mockReset();
      const open = vi.spyOn(window, "open").mockImplementation(() => null);
      window.history.replaceState(
        {},
        "",
        "/project/p1/observations?peek=obs&traceId=trace&aggregation=session",
      );
      const { result } = renderHook(() =>
        usePeekNavigation({
          tableName: "events",
          isV4: true,
          expandConfig: {
            basePath: "/project/p1/traces",
            pathParam: "traceId",
          },
        }),
      );
      result.current.expandPeek(newTab);
      if (newTab) {
        expect(open).toHaveBeenCalledWith(
          expect.stringContaining(
            "/project/p1/traces/trace?aggregation=session",
          ),
          "_blank",
        );
      } else {
        expect(mockPush).toHaveBeenCalledWith(
          "/project/p1/traces/trace?aggregation=session",
        );
      }
      open.mockRestore();
    },
  );

  it("sets explicit entry parameters and clears them on ordinary entry and close", () => {
    mockPush.mockReset();
    window.history.replaceState(
      {},
      "",
      "/project/p1/traces?peek=old&comments=open",
    );
    const { result } = renderHook(() =>
      usePeekNavigation({
        queryParams: ["annotation", "comments", "traceId"],
        tableName: "experimentItems",
        isV4: true,
        extractParamsValuesFromRow: (row) => ({ traceId: row.traceId }),
      }),
    );
    result.current.openPeek(
      "item",
      { traceId: "trace" },
      { queryParams: { annotation: "open" } },
    );
    expect(mockPush.mock.lastCall?.[0].query).toMatchObject({
      peek: "item",
      traceId: "trace",
      annotation: "open",
    });
    expect(mockPush.mock.lastCall?.[0].query).not.toHaveProperty("comments");
    window.history.replaceState(
      {},
      "",
      "/project/p1/traces?peek=item&annotation=open",
    );
    result.current.openPeek("item", { traceId: "trace" });
    expect(mockPush.mock.lastCall?.[0].query).not.toHaveProperty("annotation");
    result.current.closePeek();
    expect(mockPush.mock.lastCall?.[0].query).not.toHaveProperty("annotation");
  });
});
