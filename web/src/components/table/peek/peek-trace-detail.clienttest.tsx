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
    leadingContent,
    hideItemBadge,
    itemType,
  }: {
    actions?: React.ReactNode;
    children: React.ReactNode;
    leadingContent?: React.ReactNode;
    hideItemBadge?: boolean;
    itemType?: string;
  }) => (
    <div>
      {leadingContent}
      {itemType && !hideItemBadge ? (
        <div data-testid="item-type">{itemType}</div>
      ) : null}
      {actions}
      {children}
    </div>
  ),
  shouldClosePeekAfterDelete: vi.fn(),
}));
vi.mock("@/src/features/traces", () => ({
  canSelectObservationView: () => false,
  getSelectedObservation: () => null,
  getTraceDetailModeTitle: (aggregationLevel: string) =>
    aggregationLevel === "session" ? "s" : "Trace",
  TraceAggregationToggle: ({
    canSelectObservation,
    canSelectSession,
    onAggregationLevelChange,
  }: {
    canSelectObservation: boolean;
    canSelectSession: boolean;
    onAggregationLevelChange: (aggregationLevel: "trace" | "session") => void;
  }) => (
    <>
      <button
        role="tab"
        aria-label="Show observation details only"
        aria-selected={false}
        disabled={!canSelectObservation}
      />
      <button
        role="tab"
        aria-label="Aggregate by session"
        aria-selected={false}
        disabled={!canSelectSession}
        onClick={() => onAggregationLevelChange("session")}
      />
    </>
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
    expect(screen.queryByTestId("item-type")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Aggregate by session" }));

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
    expect(screen.getByTestId("item-type")).toHaveTextContent("TRACE");
    expect(
      screen.queryByRole("tab", { name: "Aggregate by session" }),
    ).not.toBeInTheDocument();
  });

  it("keeps v4 tabs visible when observation and session modes are unavailable", () => {
    mockUsePeekData.mockReturnValue({
      data: {
        id: "t",
        projectId: "p",
        public: false,
        sessionId: null,
        observations: [],
      },
      canAggregateBySession: false,
      isSessionScopeUnavailable: false,
      truncatedAtObservations: undefined,
    });

    render(
      <TablePeekViewTraceDetail
        projectId="p"
        itemType="TRACE"
        closePeek={vi.fn()}
        tableName="traces"
        isV4
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Show observation details only" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("tab", { name: "Aggregate by session" }),
    ).toBeDisabled();
    expect(screen.queryByTestId("item-type")).not.toBeInTheDocument();
  });
});
