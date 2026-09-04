import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TablePeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";

const { mockRouter, mockUsePeekData } = vi.hoisted(() => ({
  mockRouter: {
    pathname: "/project/[projectId]/traces",
    query: {
      projectId: "p",
      peek: "o",
      observation: "o",
      traceId: "t",
      timestamp: "2026-09-03T11:33:49.981Z",
    } as Record<string, string>,
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
    title,
  }: {
    actions?: React.ReactNode;
    children: React.ReactNode;
    leadingContent?: React.ReactNode;
    hideItemBadge?: boolean;
    itemType?: string;
    title?: React.ReactNode;
  }) => (
    <div>
      {leadingContent}
      <div data-testid="peek-title">{title}</div>
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
  canSelectObservationView: () => true,
  getSelectedObservation: () => ({
    id: "o",
    name: "Observation name",
    type: "GENERATION",
  }),
  getTraceDetailModeTitle: (aggregationLevel: string) =>
    aggregationLevel === "observation" ? "Observation name" : "Trace",
  TraceAggregationToggle: ({
    canSelectObservation,
    canSelectSession,
    observationType,
    onAggregationLevelChange,
  }: {
    canSelectObservation: boolean;
    canSelectSession: boolean;
    observationType: string | null;
    onAggregationLevelChange: (
      aggregationLevel: "trace" | "session" | "observation",
    ) => void;
  }) => (
    <>
      <div data-testid="observation-type">{observationType}</div>
      <button
        role="tab"
        aria-label="Show observation details only"
        aria-selected={false}
        disabled={!canSelectObservation}
        onClick={() => onAggregationLevelChange("observation")}
      />
      <button
        role="tab"
        aria-label="Aggregate by session"
        aria-selected={false}
        disabled={!canSelectSession}
      />
    </>
  ),
  TraceDetailActions: () => <div />,
  TraceDetailBody: () => <div />,
  traceDetailTitle: () => "Trace",
}));

describe("TablePeekViewObservationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouter.query = {
      projectId: "p",
      peek: "o",
      observation: "o",
      traceId: "t",
      timestamp: "2026-09-03T11:33:49.981Z",
    };
    mockUsePeekData.mockReturnValue({
      data: {
        id: "t",
        projectId: "p",
        public: false,
        sessionId: "s",
        observations: [{ id: "o", traceId: "t", type: "GENERATION" }],
      },
      canAggregateBySession: true,
      truncatedAtObservations: undefined,
    });
  });

  it("defaults to trace aggregation and preserves peek params in observation mode", () => {
    render(
      <TablePeekViewObservationDetail
        projectId="p"
        itemType="TRACE"
        closePeek={vi.fn()}
        tableName="events"
        isV4
      />,
    );

    expect(mockUsePeekData).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregationLevel: "trace",
        readPath: "v4",
      }),
    );
    expect(screen.getByTestId("observation-type")).toHaveTextContent(
      "GENERATION",
    );
    expect(screen.queryByTestId("item-type")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("tab", { name: "Show observation details only" }),
    );

    expect(mockRouter.replace).toHaveBeenCalledWith(
      {
        pathname: mockRouter.pathname,
        query: {
          projectId: "p",
          peek: "o",
          observation: "o",
          traceId: "t",
          timestamp: "2026-09-03T11:33:49.981Z",
          aggregation: "observation",
        },
      },
      undefined,
      { shallow: true },
    );
  });

  it("shows the selected observation name in observation mode", () => {
    mockRouter.query = {
      ...mockRouter.query,
      aggregation: "observation",
    };

    render(
      <TablePeekViewObservationDetail
        projectId="p"
        itemType="TRACE"
        closePeek={vi.fn()}
        tableName="events"
        isV4
      />,
    );

    expect(screen.getByTestId("peek-title")).toHaveTextContent(
      "Observation name",
    );
  });
});
