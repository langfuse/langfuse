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

const metadataQuery = vi.hoisted(() => vi.fn(() => ({ data: undefined })));

vi.mock("@/src/utils/api", () => ({
  api: {
    scores: {
      getScoreMetadataById: {
        useQuery: metadataQuery,
      },
    },
  },
}));

vi.mock("@/src/components/table/ConnectedIOTableCell", () => ({
  ConnectedIOTableCell: () => <div>IO cell</div>,
}));

const observationScoreKey = "quality-EVAL-NUMERIC";
const traceScoreKey = "correctness-API-NUMERIC";

const renderGridCell = (
  showScoreLevelLabels: boolean,
  columnVisibility: VisibilityState = { output: false, metadata: false },
  output: unknown = null,
  onExperimentClick?: (event: React.MouseEvent) => void,
  isBaseline = true,
) =>
  render(
    <TooltipProvider>
      <ExperimentGridCell
        projectId="project-id"
        itemId="item-id"
        onExperimentClick={onExperimentClick}
        output={output}
        level="GENERATION"
        startTime={new Date("2026-07-30T10:00:00.000Z")}
        observationId="observation-id"
        traceId="trace-id"
        singleLine={false}
        scores={{
          [observationScoreKey]: {
            type: "NUMERIC",
            values: [0.8],
            average: 0.8,
            id: "score-id",
            hasMetadata: true,
            comment: "Evaluator comment",
            executionTraceId: "execution-trace-id",
          },
        }}
        traceScores={{
          [traceScoreKey]: {
            type: "NUMERIC",
            values: [0.9],
            average: 0.9,
            id: "trace-score-id",
          },
        }}
        observationScoreOrder={[observationScoreKey]}
        traceScoreOrder={[traceScoreKey]}
        isBaseline={isBaseline}
        baselineScores={{
          [observationScoreKey]: {
            type: "NUMERIC",
            values: [0.3],
            average: 0.3,
            id: "baseline-score-id",
          },
        }}
        baselineTraceScores={{
          [traceScoreKey]: {
            type: "NUMERIC",
            values: [0.7],
            average: 0.7,
            id: "baseline-trace-score-id",
          },
        }}
        columnVisibility={columnVisibility}
        showScoreLevelLabels={showScoreLevelLabels}
      />
    </TooltipProvider>,
  );

describe("ExperimentGridCell", () => {
  it("keeps inline score diffs without explanatory native tooltips", () => {
    const { unmount } = renderGridCell(
      false,
      { output: false, metadata: false },
      null,
      undefined,
      false,
    );
    expect(screen.getByText("+0.50")).toBeInTheDocument();
    expect(screen.getByText("+0.50")).not.toHaveAttribute("title");
    expect(screen.getByText("+0.20")).toBeInTheDocument();
    unmount();
    renderGridCell(false);
    expect(screen.queryByText("+0.50")).not.toBeInTheDocument();
    expect(screen.queryByText("+0.20")).not.toBeInTheDocument();
  });

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

  it("shows separate labelled metrics", () => {
    renderGridCell(false, { output: false });

    expect(screen.getByText("Latency")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    // Neither is recorded in this fixture, so both render the affordance.
    expect(screen.getAllByText("not recorded")).toHaveLength(2);
  });

  it("hides metadata when only scores are selected", () => {
    renderGridCell(false, {
      output: false,
      totalCost: false,
      latencyMs: false,
      level: false,
      itemId: false,
      observationId: false,
      startTime: false,
    });

    expect(screen.getByText("quality")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "IDs" }),
    ).not.toBeInTheDocument();
  });

  it("omits identifiers even when old visibility preferences enable them", () => {
    renderGridCell(false, { output: false });

    expect(screen.queryByText("item-id")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "IDs" }),
    ).not.toBeInTheDocument();
  });

  it("lets the output section take the row's spare height", () => {
    renderGridCell(false, {});

    expect(
      screen
        .getByText("quality")
        .compareDocumentPosition(screen.getByText("Cost")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen
        .getByText("Cost")
        .compareDocumentPosition(screen.getByText("Output")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const outputContent =
      screen.getByText("Output").parentElement?.nextElementSibling;

    expect(outputContent).toHaveClass("min-h-16", "flex-1", "overflow-hidden");
    expect(outputContent?.firstElementChild).toBe(screen.getByText("IO cell"));
  });

  it("links evaluator score comments to their execution trace", async () => {
    renderGridCell(false);

    expect(metadataQuery).toHaveBeenCalledWith(
      { projectId: "project-id", id: "score-id" },
      expect.objectContaining({ enabled: false }),
    );
    fireEvent.pointerEnter(screen.getByText("quality"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });

    const executionTraceLink = await waitFor(() =>
      screen.getByRole("link", { name: "View execution trace" }),
    );

    expect(metadataQuery).toHaveBeenCalledWith(
      { projectId: "project-id", id: "score-id" },
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.getByText("Evaluator comment")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View score comment" }),
    ).not.toBeInTheDocument();
    expect(executionTraceLink).toHaveAttribute(
      "href",
      "/project/project-id/traces/execution-trace-id",
    );
  });

  it("opens this experiment when its cell is clicked", () => {
    const onExperimentClick = vi.fn();
    const { container } = renderGridCell(
      false,
      { output: false, metadata: false },
      null,
      onExperimentClick,
    );

    fireEvent.click(container.firstElementChild as Element);

    expect(onExperimentClick).toHaveBeenCalledTimes(1);
  });

  it("offers no pointer affordance when the cell cannot open a peek", () => {
    const { container } = renderGridCell(false);

    expect(container.firstElementChild).not.toHaveClass("cursor-pointer");
  });

  // A score name used to render as Radix's default <a>, which the row-click
  // guard always ignores — a dead zone in an otherwise clickable cell.
  it("keeps the score name clickable rather than rendering it as a link", () => {
    const onExperimentClick = vi.fn();
    renderGridCell(
      false,
      { output: false, metadata: false },
      null,
      onExperimentClick,
    );

    const scoreName = screen.getByText("quality");

    expect(scoreName.closest("a")).toBeNull();

    fireEvent.click(scoreName);

    expect(onExperimentClick).toHaveBeenCalledTimes(1);
  });
});
