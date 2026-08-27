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
    expect(target).toContain("timestamp=2026-07-14T19:47:57.703Z");
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
