import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TracePanelDetail } from "@/src/features/traces/components/TracePanelDetail";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";

const { mockUseSelection, mockUseTraceData, mockByIdQuery } = vi.hoisted(
  () => ({
    mockUseSelection: vi.fn(),
    mockUseTraceData: vi.fn(),
    mockByIdQuery: vi.fn(),
  }),
);

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
  () => ({ TraceDetailView: () => <div data-testid="trace-detail" /> }),
);
vi.mock(
  "@/src/features/traces/components/ObservationDetailView/ConnectedObservationDetailView",
  () => ({
    ConnectedObservationDetailView: ({
      observation,
    }: {
      observation: ObservationReturnTypeWithMetadata;
    }) => <div data-testid="observation-detail">{observation.id}</div>,
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
    // The loaded list is capped, so it holds only "in-list" — and the tree built
    // from it knows only that node plus the synthetic TRACE node.
    const observations = [observation("in-list")];
    mockUseTraceData.mockReturnValue({
      trace: { id: "t", projectId: "p" },
      observations,
      activeTraceObservations: observations,
      nodeMap: new Map([
        ["in-list", { id: "in-list", type: "SPAN" }],
        ["trace-t", { id: "trace-t", type: "TRACE" }],
      ]),
      serverScores: [],
      corrections: [],
      isTraceDetailLoading: false,
      isTraceDetailError: false,
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

  it("shows a loading state while a sibling trace is hydrated", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "trace-t" });
    mockUseTraceData.mockReturnValue({
      ...mockUseTraceData(),
      isTraceDetailLoading: true,
    });

    const { container } = render(<TracePanelDetail />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByTestId("trace-detail")).not.toBeInTheDocument();
  });

  it("shows an error instead of placeholder sibling trace data", () => {
    mockUseSelection.mockReturnValue({ selectedNodeId: "trace-t" });
    mockUseTraceData.mockReturnValue({
      ...mockUseTraceData(),
      isTraceDetailError: true,
    });

    render(<TracePanelDetail />);

    expect(screen.getByText("Could not load trace")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-detail")).not.toBeInTheDocument();
  });
});
