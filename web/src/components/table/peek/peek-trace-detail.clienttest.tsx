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
    widthMode,
  }: {
    actions?: React.ReactNode;
    children: React.ReactNode;
    leadingContent?: React.ReactNode;
    hideItemBadge?: boolean;
    itemType?: string;
    widthMode?: string;
  }) => (
    <div>
      {leadingContent}
      {itemType && !hideItemBadge ? (
        <div data-testid="item-type">{itemType}</div>
      ) : null}
      {widthMode ? <div data-testid="width-mode">{widthMode}</div> : null}
      {actions}
      {children}
    </div>
  ),
  shouldClosePeekAfterDelete: vi.fn(),
}));
vi.mock("@/src/features/traces", () => ({
  getDefaultObservationId: () => "root-observation",
  getSelectedObservation: () => null,
  getTraceDetailModeTitle: (aggregationLevel: string) =>
    aggregationLevel === "session" ? "s" : "Trace",
  TraceAggregationToggle: ({
    canSelectSession,
    onAggregationLevelChange,
  }: {
    canSelectSession: boolean;
    onAggregationLevelChange: (
      aggregationLevel: "trace" | "session" | "observation",
    ) => void;
  }) => (
    <>
      <button
        role="tab"
        aria-label="Show observation details only"
        aria-selected={false}
        onClick={() => onAggregationLevelChange("observation")}
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
    expect(screen.getByTestId("width-mode")).toHaveTextContent("split");

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
    expect(screen.queryByTestId("width-mode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Aggregate by session" }),
    ).not.toBeInTheDocument();
  });

  it("keeps observation available when session mode is unavailable", () => {
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
    ).toBeEnabled();
    expect(
      screen.getByRole("tab", { name: "Aggregate by session" }),
    ).toBeDisabled();
    expect(screen.queryByTestId("item-type")).not.toBeInTheDocument();
  });

  it("selects the root observation when entering observation mode", () => {
    render(
      <TablePeekViewTraceDetail
        projectId="p"
        itemType="TRACE"
        closePeek={vi.fn()}
        tableName="traces"
        isV4
      />,
    );

    fireEvent.click(
      screen.getByRole("tab", { name: "Show observation details only" }),
    );

    expect(mockRouter.replace).toHaveBeenCalledWith(
      {
        pathname: mockRouter.pathname,
        query: {
          projectId: "p",
          peek: "t",
          aggregation: "observation",
          observation: "root-observation",
        },
      },
      undefined,
      { shallow: true },
    );
  });
});
