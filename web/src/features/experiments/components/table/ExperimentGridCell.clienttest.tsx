import { render, screen } from "@testing-library/react";
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

const observationScoreKey = "quality-API-NUMERIC";
const traceScoreKey = "correctness-API-NUMERIC";

const renderGridCell = (
  showScoreLevelLabels: boolean,
  columnVisibility: VisibilityState = { output: false, metadata: false },
) =>
  render(
    <TooltipProvider>
      <ExperimentGridCell
        projectId="project-id"
        itemId="item-id"
        output={null}
        level="GENERATION"
        startTime={new Date("2026-07-30T10:00:00.000Z")}
        observationId="observation-id"
        traceId="trace-id"
        scores={{
          [observationScoreKey]: {
            type: "NUMERIC",
            values: [0.8],
            average: 0.8,
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

describe("ExperimentGridCell score level labels", () => {
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
});
