import { fireEvent, render, screen } from "@testing-library/react";
import type { PaginationState } from "@tanstack/react-table";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  ExperimentScoreMatrix,
  type ScoreMatrixColumn,
  type ScoreMatrixRow,
} from "./ExperimentScoreMatrix";
import type { ExperimentItemsTableRow } from "./types";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const scoreKey = "groundedness-EVAL-NUMERIC";

const scoreRows: ScoreMatrixRow[] = [
  { scoreKey, level: "trace", dataType: "NUMERIC", label: "# groundedness" },
];

const experiments: ScoreMatrixColumn[] = [
  { experimentId: "base", experimentName: "baseline-run", isBaseline: true },
  { experimentId: "cand", experimentName: "candidate-run", isBaseline: false },
];

const itemRow = (id: string, value: number): ExperimentItemsTableRow =>
  ({
    id,
    experiments: experiments.map((experiment) => ({
      experimentId: experiment.experimentId,
      traceScores: { [scoreKey]: { type: "NUMERIC", average: value } },
    })),
  }) as unknown as ExperimentItemsTableRow;

const renderMatrix = ({
  rows,
  state,
  onChange,
  totalCount,
}: {
  rows: ExperimentItemsTableRow[];
  state: PaginationState;
  onChange: (next: unknown) => void;
  totalCount: number | null;
}) =>
  render(
    <TooltipProvider>
      <ExperimentScoreMatrix
        rows={rows}
        scoreRows={scoreRows}
        experiments={experiments}
        isLoading={false}
        pagination={{ totalCount, onChange, state }}
      />
    </TooltipProvider>,
  );

describe("ExperimentScoreMatrix pagination", () => {
  it("offers page controls and reports the window it aggregated", () => {
    const onChange = vi.fn();
    renderMatrix({
      rows: [itemRow("a", 0.5), itemRow("b", 0.7)],
      state: { pageIndex: 0, pageSize: 2 },
      onChange,
      totalCount: 6,
    });

    // The footnote has to name the window, since the cells above it are an
    // aggregate over exactly these rows and not over the whole run.
    expect(
      screen.getByText(/aggregated over the 2 items on this page/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /go to next page/i }));
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps the page controls when no score has a value on this page", () => {
    render(
      <TooltipProvider>
        <ExperimentScoreMatrix
          rows={[itemRow("a", 0.5)]}
          scoreRows={[]}
          experiments={experiments}
          isLoading={false}
          pagination={{
            totalCount: 6,
            onChange: vi.fn(),
            state: { pageIndex: 1, pageSize: 1 },
          }}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByText(/No score columns are visible for the items in view/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to next page/i }),
    ).toBeInTheDocument();
  });
});
