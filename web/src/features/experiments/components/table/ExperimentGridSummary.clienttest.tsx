import { fireEvent, render, screen } from "@testing-library/react";
import { ExperimentGridSummaryValues } from "./ExperimentGridSummary";
import { type ExperimentItemsTableRow } from "./types";

const key = "quality-EVAL-NUMERIC";
const rows = [
  {
    itemId: "one",
    experiments: [
      {
        experimentId: "baseline",
        observationScores: {
          [key]: { type: "NUMERIC", average: 0.2, values: [0.2] },
        },
      },
      {
        experimentId: "comparison",
        observationScores: {
          [key]: { type: "NUMERIC", average: 0.8, values: [0.8] },
        },
      },
    ],
  },
  {
    itemId: "two",
    experiments: [
      {
        experimentId: "baseline",
        observationScores: {
          [key]: { type: "NUMERIC", average: 0.6, values: [0.6] },
        },
      },
    ],
  },
] as ExperimentItemsTableRow[];

const props = {
  rows,
  experimentId: "comparison",
  baselineExperimentId: "baseline",
  observationScoreOrder: [key],
  traceScoreOrder: [],
  columnVisibility: {},
  showScoreLevelLabels: false,
  isLoading: false,
  expanded: true,
  showScoreNames: true,
  onToggle: vi.fn(),
};

describe("ExperimentGridSummaryValues", () => {
  it("reads the comparison against the baseline and excludes missing pairs from movement", () => {
    render(<ExperimentGridSummaryValues {...props} />);
    expect(screen.getByText("0.80")).toBeInTheDocument();
    expect(screen.getByText("+0.40")).toBeInTheDocument();
    expect(screen.getByLabelText("1 improved items")).toBeInTheDocument();
    expect(screen.getByLabelText("0 regressed items")).toBeInTheDocument();
    expect(
      screen.getByTitle("0 unchanged; 1 not comparable"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("this page (2 items)");
  });

  it("renders a baseline average without comparing it to itself", () => {
    render(<ExperimentGridSummaryValues {...props} experimentId="baseline" />);
    expect(screen.getByText("0.40")).toBeInTheDocument();
    expect(
      screen.queryByTitle("Difference from baseline"),
    ).not.toBeInTheDocument();
  });

  it("updates for page changes and hides summary values when collapsed", () => {
    const { rerender } = render(<ExperimentGridSummaryValues {...props} />);
    rerender(<ExperimentGridSummaryValues {...props} rows={[rows[1]]} />);
    expect(screen.getByText("not scored")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(props.onToggle).toHaveBeenCalledOnce();
    rerender(<ExperimentGridSummaryValues {...props} expanded={false} />);
    expect(screen.queryByText("quality")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
