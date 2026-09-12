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

vi.mock("@/src/utils/api", () => ({
  api: {
    scores: {
      getScoreMetadataById: {
        useQuery: () => ({ data: undefined }),
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

  it("keeps cost and latency on the metadata line", () => {
    renderGridCell(false, { output: false });

    // Neither is recorded in this fixture, so both render the affordance.
    expect(screen.getAllByText("not recorded")).toHaveLength(2);
  });

  it("keeps the ids reachable behind the metadata line instead of listing them", () => {
    renderGridCell(false, { output: false });

    expect(screen.queryByText("item-id")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "IDs" })).toBeInTheDocument();
  });

  it("lets the output section take the row's spare height", () => {
    renderGridCell(false, { metadata: false });

    const outputContent =
      screen.getByText("Output").parentElement?.nextElementSibling;

    expect(outputContent).toHaveClass("min-h-16", "flex-1", "overflow-hidden");
    expect(outputContent?.firstElementChild).toBe(screen.getByText("IO cell"));
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
