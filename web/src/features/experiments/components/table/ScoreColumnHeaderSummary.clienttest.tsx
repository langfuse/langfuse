import { render, screen } from "@testing-library/react";
import { ScoreColumnHeaderSummary } from "./ScoreColumnHeaderSummary";
import { type ScoreColumnSummary } from "@/src/features/experiments/fns/summariseScoreColumn";

const numericSummary = ({
  baseline,
  comparison,
  delta,
  improved,
  regressed,
}: {
  baseline: number;
  comparison: number;
  delta: number;
  improved: number;
  regressed: number;
}): ScoreColumnSummary => ({
  baseline: { kind: "average", value: baseline, count: 3 },
  comparison: { kind: "average", value: comparison, count: 3 },
  delta,
  movement: {
    improved,
    regressed,
    unchanged: 0,
    changed: 0,
    notComparable: 0,
  },
});

describe("ScoreColumnHeaderSummary", () => {
  it("shows one comparison line per selected run without versus", () => {
    render(
      <ScoreColumnHeaderSummary
        label="# quality (eval)"
        dataType="NUMERIC"
        hasBaseline
        expanded
        comparisonNames={["candidate-a", "candidate-b"]}
        summaries={[
          numericSummary({
            baseline: 32.11,
            comparison: 44.03,
            delta: -11.92,
            improved: 1,
            regressed: 2,
          }),
          numericSummary({
            baseline: 32.11,
            comparison: 28.5,
            delta: 3.61,
            improved: 2,
            regressed: 0,
          }),
        ]}
      />,
    );

    expect(screen.getByText("32.11")).toBeInTheDocument();
    expect(screen.getByText("AVG")).toBeInTheDocument();
    expect(screen.getByText("44.03")).toBeInTheDocument();
    expect(screen.getByText("28.50")).toBeInTheDocument();
    expect(screen.queryByText(/versus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^vs /)).not.toBeInTheDocument();
    expect(screen.queryByText("candidate-a")).not.toBeInTheDocument();
    expect(screen.queryByText("Baseline")).not.toBeInTheDocument();
  });

  it("hides aggregates when the page summary is collapsed", () => {
    render(
      <ScoreColumnHeaderSummary
        label="# quality (eval)"
        dataType="NUMERIC"
        hasBaseline
        expanded={false}
        comparisonNames={["candidate-a"]}
        summaries={[
          numericSummary({
            baseline: 32.11,
            comparison: 44.03,
            delta: -11.92,
            improved: 1,
            regressed: 2,
          }),
        ]}
      />,
    );

    expect(screen.getByText("quality (eval)")).toBeInTheDocument();
    expect(screen.queryByText("AVG")).not.toBeInTheDocument();
    expect(screen.queryByText("44.03")).not.toBeInTheDocument();
  });
});
