import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TracePanelDetail } from "@/src/features/traces/components/TracePanelDetail";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";

const {
  mockUseSelection,
  mockUseTraceData,
  mockByIdQuery,
  mockUseTraceDetailData,
} = vi.hoisted(() => ({
  mockUseSelection: vi.fn(),
  mockUseTraceData: vi.fn(),
  mockByIdQuery: vi.fn(),
  mockUseTraceDetailData: vi.fn(),
}));

vi.mock("@/src/features/traces/hooks/useTraceDetailData", () => ({
  useTraceDetailData: (input: unknown) => mockUseTraceDetailData(input),
}));

vi.mock("@/src/features/traces/contexts/SelectionContext", () => ({
  useSelection: () => mockUseSelection(),
}));
vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: () => mockUseTraceData(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    observations: {
      byId: {
        useQuery: (input: unknown, options: unknown) =>
          mockByIdQuery(input, options),
      },
    },
  },
}));
// The two detail views pull in the whole trace-detail subtree; the panel's only
// job is picking between them.
vi.mock(
  "@/src/features/traces/components/TraceDetailView/TraceDetailView",
  () => ({
    TraceDetailView: ({
      trace,
      isLoading,
    }: {
      trace?: {
        id: string;
        input?: string;
        output?: string;
        metadata?: string;
      };
      isLoading?: boolean;
    }) => (
      <div
        data-testid="trace-detail"
        data-trace-id={trace?.id}
        data-loading={isLoading}
      >
        {trace?.input}
        {trace?.output}
        {trace?.metadata}
      </div>
    ),
  }),
);
vi.mock(
  "@/src/features/traces/components/ObservationDetailView/ConnectedObservationDetailView",
  () => ({
    ConnectedObservationDetailView: ({
      observation,
      traceId,
    }: {
      observation: ObservationReturnTypeWithMetadata;
      traceId: string;
    }) => (
      <div data-testid="observation-detail" data-trace-id={traceId}>
        {observation.id}
      </div>
    ),
  }),
);

const observation = (id: string) =>
  ({
    id,
    traceId: "t",
    startTime: new Date("2026-08-12T00:00:00.000Z"),
    type: "SPAN",
  }) as unknown as ObservationReturnTypeWithMetadata;

describe("TracePanelDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockByIdQuery.mockReturnValue({ data: undefined, error: null });
    mockUseTraceDetailData.mockReturnValue({
      data: { id: "other", observations: [], scores: [], corrections: [] },
    });
    // The loaded list is capped, so it holds only "in-list" — and the tree built
    // from it knows only that node plus the synthetic TRACE node.
    mockUseTraceData.mockReturnValue({
      trace: { id: "t", projectId: "p" },
      observations: [observation("in-list")],
      nodeMap: new Map([
        ["in-list", { id: "in-list", type: "SPAN" }],
        ["trace-t", { id: "trace-t", type: "TRACE" }],
      ]),
      serverScores: [],
      corrections: [],
    });
  });

  it("shows the selected observation even when it is outside the loaded list", () => {
    // Regression: the panel used to decide "is an observation selected" from the
    // tree's nodeMap, so an observation past the 10k cap silently rendered the
    // TRACE detail instead.
    mockUseSelection.mockReturnValue({ selectedNodeId: "past-cap" });
    mockByIdQuery.mockReturnValue({ data: observation("past-cap") });

    render(<TracePanelDetail />);

    expect(screen.getByTestId("observation-detail")).toHaveTextContent(
      "past-cap",
    );
    expect(screen.queryByTestId("trace-detail")).not.toBeInTheDocument();
  });

  it("says so for an unknown observation id rather than falling back to the trace", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "bogus" });
    mockByIdQuery.mockReturnValue({
      data: undefined,
      error: { data: { code: "NOT_FOUND" } },
    });

    render(<TracePanelDetail />);

    expect(screen.getByText("Observation not found")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-detail")).not.toBeInTheDocument();
  });

  it("shows the trace detail when the trace node is selected", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "trace-t" });

    render(<TracePanelDetail />);

    expect(screen.getByTestId("trace-detail")).toBeInTheDocument();
  });

  it("opens a session observation using its own trace, not the anchor trace", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "foreign-observation" });
    mockUseTraceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p" },
      observations: [
        { ...observation("foreign-observation"), traceId: "other-trace" },
      ],
      serverScores: [],
      corrections: [],
    });
    render(<TracePanelDetail />);
    expect(screen.getByTestId("observation-detail")).toHaveAttribute(
      "data-trace-id",
      "other-trace",
    );
  });

  it("shows the selected session trace wrapper instead of fetching it as an observation", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "trace-other" });
    mockUseTraceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p" },
      sessionTraces: [{ id: "other", projectId: "p" }],
      observations: [],
      serverScores: [],
      corrections: [],
    });
    render(<TracePanelDetail />);
    expect(screen.getByTestId("trace-detail")).toHaveAttribute(
      "data-trace-id",
      "other",
    );
    expect(mockByIdQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("loads full I/O and metadata for a selected non-anchor trace", () => {
    const timestamp = new Date("2026-08-12T00:00:00.000Z");
    mockUseSelection.mockReturnValue({ selectedNodeId: "trace-other" });
    mockUseTraceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p" },
      sessionTraces: [{ id: "other", projectId: "p", timestamp }],
      observations: [],
      serverScores: [],
      corrections: [],
    });
    mockUseTraceDetailData.mockReturnValue({
      data: {
        id: "other",
        input: "full input",
        output: "full output",
        metadata: "full metadata",
        observations: [],
        scores: [],
        corrections: [],
      },
    });

    const { rerender } = render(<TracePanelDetail />);
    expect(mockUseTraceDetailData).toHaveBeenCalledWith({
      projectId: "p",
      traceId: "other",
      timestamp,
    });
    expect(screen.getByTestId("trace-detail")).toHaveTextContent(
      "full inputfull outputfull metadata",
    );

    mockUseTraceDetailData.mockReturnValue({
      data: { id: "previous", input: "stale input" },
      isPlaceholderData: true,
    });
    rerender(<TracePanelDetail key="placeholder" />);
    expect(screen.getByTestId("trace-detail")).toHaveAttribute(
      "data-loading",
      "true",
    );
    expect(screen.queryByText("stale input")).not.toBeInTheDocument();
  });

  it("shows errors instead of synthetic empty trace details", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "trace-other" });
    mockUseTraceData.mockReturnValue({
      trace: { id: "anchor", projectId: "p" },
      sessionTraces: [{ id: "other", projectId: "p" }],
      observations: [],
      serverScores: [],
      corrections: [],
    });
    mockUseTraceDetailData.mockReturnValue({ isError: true });
    render(<TracePanelDetail />);
    expect(screen.getByText("Could not load trace")).toBeInTheDocument();
  });
});
