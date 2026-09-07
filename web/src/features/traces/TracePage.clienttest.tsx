import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TracePage } from "@/src/features/traces/TracePage";

const { mockTraceDetailData } = vi.hoisted(() => ({
  mockTraceDetailData: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {
      projectId: "project-1",
      traceId: "trace-1",
      aggregation: "session",
    },
    asPath: "/project/project-1/traces/trace-1?aggregation=session",
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));
vi.mock("@/src/features/auth/hooks", () => ({
  useIsAuthenticatedAndProjectMember: () => true,
}));
vi.mock("@/src/features/traces/hooks/useTraceDetailData", () => ({
  useTraceDetailData: () => mockTraceDetailData(),
}));
vi.mock("@/src/features/traces/hooks/useTraceDetailMode", () => ({
  parseTraceDetailMode: () => "session",
  useTraceDetailMode: () => ({
    mode: "session",
    selectedObservation: null,
    setMode: vi.fn(),
    title: "Session",
  }),
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/src/features/traces/components/TraceDetailBody", () => ({
  TraceDetailBody: () => <div>Session detail body</div>,
}));
vi.mock("@/src/features/traces/components/TraceDetailActions", () => ({
  TraceDetailActions: () => null,
}));
vi.mock("@/src/features/navigate-detail-pages/DetailPageNav", () => ({
  DetailPageNav: () => null,
}));
vi.mock("@/src/features/traces/components/TraceAggregationToggle", () => ({
  TraceAggregationToggle: () => null,
}));

describe("TracePage", () => {
  beforeEach(() => {
    mockTraceDetailData.mockReturnValue({
      data: {
        id: "trace-1",
        projectId: "project-1",
        public: false,
        observations: [],
      },
      isLoading: true,
      isUnauthorized: false,
      isSessionScopeUnavailable: false,
      isNotFound: false,
      isError: false,
      isEventsTraceSource: true,
      canAggregateBySession: true,
    });
  });

  it("does not render trace fallback data as a completed session", () => {
    render(<TracePage traceId="trace-1" />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Session detail body")).not.toBeInTheDocument();
  });
});
