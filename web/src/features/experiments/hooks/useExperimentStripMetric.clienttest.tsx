import { render, screen } from "@testing-library/react";
import { useExperimentStripMetric } from "./useExperimentStripMetric";
import { type ScoreCoverageByLevel } from "@/src/features/experiments/types/charts";

const scoreOptionsQuery = vi.fn();

vi.mock("@/src/utils/api", () => ({
  api: {
    experiments: {
      scoreOptions: {
        useQuery: (...args: unknown[]) => scoreOptionsQuery(...args),
      },
    },
  },
}));

const SCORE_OPTIONS_DATA = {
  obs_scores_avg: ["groundedness"],
  obs_score_categories: [],
  experiment_scores_avg: [],
  experiment_score_categories: [],
};

/**
 * Two observation-level scores as the score-options endpoint returns them:
 * booleans are listed under `*_scores_avg` too, and only `*_score_columns`
 * says which they are.
 */
const MIXED_SCORE_OPTIONS_DATA = {
  ...SCORE_OPTIONS_DATA,
  obs_scores_avg: ["answered_in_right_language", "groundedness"],
  obs_score_columns: [
    {
      name: "answered_in_right_language",
      dataType: "BOOLEAN",
      source: "EVAL",
    },
    { name: "groundedness", dataType: "NUMERIC", source: "EVAL" },
  ],
};

function Harness({
  experimentIds,
  scoreCoverage,
}: {
  experimentIds: string[];
  scoreCoverage?: ScoreCoverageByLevel;
}) {
  const { metricId, isLoading } = useExperimentStripMetric({
    projectId: "p1",
    experimentIds,
    scoreCoverage,
  });
  return (
    <div data-testid="state">{`${isLoading ? "loading" : "ready"}:${metricId}`}</div>
  );
}

const state = () => screen.getByTestId("state").textContent;

describe("useExperimentStripMetric", () => {
  beforeEach(() => {
    sessionStorage.clear();
    scoreOptionsQuery.mockReset();
  });

  // The bug: a pending options query left the hook "ready" on the Cost
  // fallback, so a project full of scores opened on "Cost ($)". The fallback
  // asserts that the experiments in view carry no scores — it may only be
  // reached once the query can say so.
  it("stays loading while the score options are unknown", () => {
    scoreOptionsQuery.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isError: false,
    });
    render(<Harness experimentIds={["e1"]} />);
    expect(state()).toBe("loading:base:cost");
  });

  it("opens on a score once the options arrive", () => {
    scoreOptionsQuery.mockReturnValue({
      data: SCORE_OPTIONS_DATA,
      isSuccess: true,
      isError: false,
    });
    render(<Harness experimentIds={["e1"]} />);
    expect(state()).toBe("ready:obs-score-numeric:groundedness");
  });

  // Nothing to ask about: the strip renders its empty band, so it must not be
  // held on a skeleton by a query that never runs.
  it("is not loading when no experiments are in view", () => {
    scoreOptionsQuery.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isError: false,
    });
    render(<Harness experimentIds={[]} />);
    expect(state()).toBe("ready:base:cost");
  });

  // The reviewer's question: why this score? Because it is the numeric score
  // with the most values recorded across the runs in view — not the first name.
  it("opens on the best-recorded numeric score", () => {
    scoreOptionsQuery.mockReturnValue({
      data: {
        ...SCORE_OPTIONS_DATA,
        obs_scores_avg: ["accuracy", "groundedness"],
      },
      isSuccess: true,
      isError: false,
    });
    render(
      <Harness
        experimentIds={["e1"]}
        scoreCoverage={{
          obs: new Map([
            ["accuracy", 4],
            ["groundedness", 88],
          ]),
        }}
      />,
    );
    expect(state()).toBe("ready:obs-score-numeric:groundedness");
  });

  it("does not open on a boolean score while a numeric one exists", () => {
    scoreOptionsQuery.mockReturnValue({
      data: MIXED_SCORE_OPTIONS_DATA,
      isSuccess: true,
      isError: false,
    });
    render(
      <Harness
        experimentIds={["e1"]}
        scoreCoverage={{
          obs: new Map([
            ["answered_in_right_language", 300],
            ["groundedness", 30],
          ]),
        }}
      />,
    );
    expect(state()).toBe("ready:obs-score-numeric:groundedness");
  });

  it("falls back to cost when the options query fails", () => {
    scoreOptionsQuery.mockReturnValue({
      data: undefined,
      isSuccess: false,
      isError: true,
    });
    render(<Harness experimentIds={["e1"]} />);
    expect(state()).toBe("ready:base:cost");
  });
});
