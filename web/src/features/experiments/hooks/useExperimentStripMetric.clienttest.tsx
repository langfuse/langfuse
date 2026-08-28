import { render, screen } from "@testing-library/react";
import { useExperimentStripMetric } from "./useExperimentStripMetric";

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
  trace_scores_avg: [],
  trace_score_categories: [],
  experiment_scores_avg: [],
  experiment_score_categories: [],
};

function Harness({ experimentIds }: { experimentIds: string[] }) {
  const { metricId, isLoading } = useExperimentStripMetric({
    projectId: "p1",
    experimentIds,
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
