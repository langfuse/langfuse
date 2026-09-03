import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";

const { mockRouter, mockUsePeekData } = vi.hoisted(() => ({
  mockRouter: {
    pathname: "/project/[projectId]/traces",
    query: { projectId: "p", peek: "t" } as Record<string, string>,
    replace: vi.fn(),
  },
  mockUsePeekData: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));
vi.mock("@/src/components/table/peek/hooks/usePeekData", () => ({
  usePeekData: (args: unknown) => mockUsePeekData(args),
}));
vi.mock("@/src/components/table/peek", () => ({
  TablePeekView: ({
    actions,
    children,
  }: {
    actions?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
  shouldClosePeekAfterDelete: vi.fn(),
}));
vi.mock("@/src/features/traces", () => ({
  TraceAggregationToggle: ({
    onAggregationLevelChange,
  }: {
    onAggregationLevelChange: (aggregationLevel: "trace" | "session") => void;
  }) => (
    <button
      role="radio"
      aria-label="Aggregate by session"
      aria-checked={false}
      onClick={() => onAggregationLevelChange("session")}
    />
  ),
  TraceDetailActions: () => <div />,
  TraceDetailBody: () => <div />,
  traceDetailTitle: () => "Trace",
}));

describe("TablePeekViewTraceDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.query = { projectId: "p", peek: "t" };
    mockUsePeekData.mockReturnValue({
      data: {
        id: "t",
        projectId: "p",
        public: false,
        sessionId: "s",
      },
      canAggregateBySession: true,
      isSessionScopeUnavailable: false,
      truncatedAtObservations: undefined,
    });
  });

  it("defaults to trace aggregation and switches the URL to session aggregation", () => {
    render(
      <TablePeekViewTraceDetail
        projectId="p"
        itemType="TRACE"
        closePeek={vi.fn()}
        tableName="traces"
        isV4
      />,
    );

    expect(mockUsePeekData).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregationLevel: "trace",
        readPath: "v4",
      }),
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "Aggregate by session" }),
    );

    expect(mockRouter.replace).toHaveBeenCalledWith(
      {
        pathname: mockRouter.pathname,
        query: { projectId: "p", peek: "t", aggregation: "session" },
      },
      undefined,
      { shallow: true },
    );
  });

  it("keeps the v3 trace-row peek unchanged", () => {
    render(
      <TablePeekViewTraceDetail
        projectId="p"
        itemType="TRACE"
        closePeek={vi.fn()}
        tableName="traces"
        isV4={false}
      />,
    );

    expect(mockUsePeekData).toHaveBeenCalledWith({
      projectId: "p",
      traceId: "t",
      timestamp: undefined,
    });
    expect(
      screen.queryByRole("radio", { name: "Aggregate by session" }),
    ).not.toBeInTheDocument();
  });
});
