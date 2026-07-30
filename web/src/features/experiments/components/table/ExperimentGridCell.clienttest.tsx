import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { VisibilityState } from "@tanstack/react-table";
import { ExperimentGridCell } from "./ExperimentGridCell";
import { TooltipProvider } from "@/src/components/ui/tooltip";

const experimentBatchIOUseQueryMock = vi.hoisted(() =>
  vi.fn(() => ({ data: undefined, isLoading: false })),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    scores: {
      getScoreMetadataById: {
        useQuery: () => ({ data: undefined }),
      },
    },
    events: {
      experimentBatchIO: {
        useQuery: experimentBatchIOUseQueryMock,
      },
    },
  },
}));

vi.mock("@/src/components/ui/IOTableCell", () => ({
  MemoizedIOTableCell: ({
    enableExpandOnHover,
    onExpandOpenChange,
  }: {
    enableExpandOnHover?: boolean;
    onExpandOpenChange?: (open: boolean) => void;
  }) =>
    enableExpandOnHover ? (
      <button
        type="button"
        onClick={() => onExpandOpenChange?.(true)}
        aria-label="Expand output"
      >
        IO cell
      </button>
    ) : (
      <div>IO cell</div>
    ),
}));

const observationScoreKey = "quality-EVAL-NUMERIC";
const traceScoreKey = "correctness-API-NUMERIC";

const renderGridCell = (
  showScoreLevelLabels: boolean,
  columnVisibility: VisibilityState = { output: false, metadata: false },
  outputPotentiallyTruncated = false,
) =>
  render(
    <TooltipProvider>
      <ExperimentGridCell
        projectId="project-id"
        itemId="item-id"
        output={null}
        outputPotentiallyTruncated={outputPotentiallyTruncated}
        level="GENERATION"
        startTime={new Date("2026-07-30T10:00:00.000Z")}
        observationId="observation-id"
        traceId="trace-id"
        scores={{
          [observationScoreKey]: {
            type: "NUMERIC",
            values: [0.8],
            average: 0.8,
            comment: "Evaluator comment",
            executionTraceId: "execution-trace-id",
          },
        }}
        traceScores={{
          [traceScoreKey]: {
            type: "NUMERIC",
            values: [0.9],
            average: 0.9,
          },
        }}
        observationScoreOrder={[observationScoreKey]}
        traceScoreOrder={[traceScoreKey]}
        isBaseline
        columnVisibility={columnVisibility}
        showScoreLevelLabels={showScoreLevelLabels}
      />
    </TooltipProvider>,
  );

describe("ExperimentGridCell", () => {
  it("shows full labels for every score when both levels are present", () => {
    renderGridCell(true);

    expect(screen.getByText("Observation")).toBeInTheDocument();
    expect(screen.getByText("Trace")).toBeInTheDocument();
  });

  it("omits score level decoration when only one level is present", () => {
    renderGridCell(false);

    expect(screen.queryByText("Observation")).not.toBeInTheDocument();
    expect(screen.queryByText("Trace")).not.toBeInTheDocument();
    expect(screen.getByText("quality")).toBeInTheDocument();
    expect(screen.getByText("correctness")).toBeInTheDocument();
  });

  it("renders the latency row when no latency value is available", () => {
    renderGridCell(false, { output: false });

    expect(screen.getByText("Latency")).toBeInTheDocument();
  });

  it("renders output in a fixed-height scroll area", () => {
    renderGridCell(false, { metadata: false });

    const outputContent =
      screen.getByText("Output").parentElement?.nextElementSibling;

    expect(outputContent).toHaveClass("h-16", "overflow-hidden");
  });

  it("loads full output only when the output hover opens", () => {
    experimentBatchIOUseQueryMock.mockClear();
    renderGridCell(false, { metadata: false }, true);

    expect(experimentBatchIOUseQueryMock).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand output" }));

    expect(experimentBatchIOUseQueryMock).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: true }),
    );
  });

  it("does not enable output expansion for complete previews", () => {
    experimentBatchIOUseQueryMock.mockClear();
    renderGridCell(false, { metadata: false });

    expect(
      screen.queryByRole("button", { name: "Expand output" }),
    ).not.toBeInTheDocument();
    expect(experimentBatchIOUseQueryMock).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("links evaluator score comments to their execution trace", async () => {
    renderGridCell(false);

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "View score comment" }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });

    const executionTraceLink = await waitFor(() =>
      screen.getByRole("link", { name: "View execution trace" }),
    );

    expect(executionTraceLink).toHaveAttribute(
      "href",
      "/project/project-id/traces/execution-trace-id",
    );
  });
});
