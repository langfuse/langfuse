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
    onAggregationLevelChange: (
      aggregationLevel: "trace" | "session" | "observation",
    ) => void;
  }) => (
    <button
      role="radio"
      aria-label="Show observation details only"
      aria-checked={false}
      onClick={() => onAggregationLevelChange("observation")}
    />
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

    fireEvent.click(
      screen.getByRole("radio", { name: "Show observation details only" }),
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
});
