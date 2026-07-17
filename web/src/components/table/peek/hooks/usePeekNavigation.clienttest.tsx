import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";

const { mockPush, mockPathname } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockPathname: { value: "/project/[projectId]/traces" },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: mockPush, pathname: mockPathname.value }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: false }),
}));

// expandPeek builds the standalone-page path from `expandConfig.pathParam`.
// The trace reader's expand must survive both peek URL dialects (LFE-11041):
// v4 URLs put the trace id in `traceId`, v3 URLs put it in `peek`.
describe("usePeekNavigation expandPeek", () => {
  const config = {
    queryParams: ["observation", "display", "timestamp", "traceId"],
    expandConfig: {
      basePath: "/project/p1/traces",
      pathParam: "traceId",
    },
  };

  beforeEach(() => {
    mockPush.mockReset();
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

  it("v3-dialect URL (no traceId param): falls back to peek for the path segment", () => {
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
  });
});
