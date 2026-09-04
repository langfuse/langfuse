import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectTraceNode } from "./useSelectTraceNode";

const {
  mockPush,
  mockRouter,
  mockSetSelectedNodeId,
  mockUseTraceData,
  mockUseViewPreferences,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRouter: {
    pathname: "/project/[projectId]/traces/[traceId]",
    query: {
      projectId: "p",
      traceId: "trace-1",
      view: "timeline",
    } as Record<string, string>,
    push: vi.fn(),
  },
  mockSetSelectedNodeId: vi.fn(),
  mockUseTraceData: vi.fn(),
  mockUseViewPreferences: vi.fn(),
}));

vi.mock("next/router", () => ({ useRouter: () => mockRouter }));
vi.mock("@/src/features/traces/contexts/SelectionContext", () => ({
  useSelection: () => ({ setSelectedNodeId: mockSetSelectedNodeId }),
}));
vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => mockUseTraceData(),
}));
vi.mock("@/src/features/traces/contexts/ViewPreferencesContext", () => ({
  useViewPreferences: () => mockUseViewPreferences(),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/traces/hooks/useTraceAnalyticsDimensions", () => ({
  useTraceAnalyticsDimensions: () => ({ isV4: true }),
}));
vi.mock("@/src/features/traces/components/TraceLayoutDesktop", () => ({
  useDesktopLayoutContextOptional: () => null,
}));
vi.mock("@/src/features/traces/components/TraceLayoutMobile", () => ({
  useMobileLayoutContextOptional: () => null,
}));

describe("useSelectTraceNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockResolvedValue(true);
    mockRouter.push = mockPush;
    mockRouter.pathname = "/project/[projectId]/traces/[traceId]";
    mockRouter.query = {
      projectId: "p",
      traceId: "trace-1",
      view: "timeline",
    };
    mockUseViewPreferences.mockReturnValue({ traceContext: "fullscreen" });
    mockUseTraceData.mockReturnValue({
      nodeMap: new Map([
        [
          "trace-trace-2",
          { id: "trace-trace-2", type: "TRACE", traceId: "trace-2" },
        ],
        ["obs-1", { id: "obs-1", type: "SPAN", traceId: "trace-2" }],
        [
          "session-session-1",
          { id: "session-session-1", type: "SESSION", sessionId: "session-1" },
        ],
      ]),
    });
  });

  it("selects a fullscreen trace without navigating immediately", () => {
    const { result } = renderHook(() => useSelectTraceNode("tree"));

    act(() => result.current("trace-trace-2"));

    expect(mockSetSelectedNodeId).toHaveBeenCalledWith("trace-trace-2");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("selects a peek trace without navigating immediately", () => {
    mockUseViewPreferences.mockReturnValue({ traceContext: "peek" });
    mockRouter.pathname = "/project/[projectId]/traces";
    mockRouter.query = {
      projectId: "p",
      traceId: "trace-1",
      view: "timeline",
      peek: "obs-1",
      observation: "obs-1",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    const { result } = renderHook(() => useSelectTraceNode("timeline_compact"));

    act(() => result.current("trace-trace-2"));

    expect(mockSetSelectedNodeId).toHaveBeenCalledWith("trace-trace-2");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps observation selection inside the current session view", () => {
    const { result } = renderHook(() => useSelectTraceNode("search"));

    act(() => result.current("obs-1"));

    expect(mockSetSelectedNodeId).toHaveBeenCalledWith("obs-1");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps the structural session root non-selectable", () => {
    const { result } = renderHook(() => useSelectTraceNode("tree"));

    act(() => result.current("session-session-1"));

    expect(mockSetSelectedNodeId).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
