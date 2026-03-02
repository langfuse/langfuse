import { render, screen } from "@testing-library/react";
import { api } from "../../../utils/api";
import { useScoreAnalyticsQuery } from "./useScoreAnalyticsQuery";

jest.mock("../../../utils/api", () => ({
  api: {
    scoreAnalytics: {
      getScoreComparisonAnalytics: {
        useQuery: jest.fn(),
      },
    },
  },
}));

const mockedUseQuery = api.scoreAnalytics.getScoreComparisonAnalytics
  .useQuery as jest.Mock;

function ScoreAnalyticsProbe() {
  const result = useScoreAnalyticsQuery({
    projectId: "project-test",
    score1: {
      name: "Correctness",
      dataType: "BOOLEAN",
      source: "ANNOTATION",
    },
    fromTimestamp: new Date("2026-02-01T00:00:00.000Z"),
    toTimestamp: new Date("2026-02-02T00:00:00.000Z"),
    interval: { count: 1, unit: "day" },
  });

  return (
    <div data-testid="distribution">
      {JSON.stringify(result.data?.distribution.score1 ?? null)}
    </div>
  );
}

describe("useScoreAnalyticsQuery", () => {
  it("maps true-only boolean data to the True bucket", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        counts: { score1Total: 1, score2Total: 1, matchedCount: 1 },
        heatmap: [],
        confusionMatrix: [],
        statistics: null,
        timeSeries: [],
        distribution1: [{ binIndex: 0, count: 1 }],
        distribution2: [],
        stackedDistribution: [],
        stackedDistributionMatched: [],
        score2Categories: [],
        timeSeriesMatched: [],
        distribution1Matched: [{ binIndex: 0, count: 1 }],
        distribution2Matched: [],
        distribution1Individual: [{ binIndex: 0, count: 1 }],
        distribution2Individual: [],
        timeSeriesCategorical1: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "true",
            count: 1,
          },
        ],
        timeSeriesCategorical2: [],
        timeSeriesCategorical1Matched: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "true",
            count: 1,
          },
        ],
        timeSeriesCategorical2Matched: [],
        samplingMetadata: {
          isSampled: false,
          samplingMethod: "none",
          samplingRate: 1,
          estimatedTotalMatches: 1,
          actualSampleSize: 1,
          samplingExpression: null,
        },
        metadata: {
          mode: "single",
          isSameScore: true,
          dataType: "BOOLEAN",
        },
      },
      isLoading: false,
      error: null,
    });

    render(<ScoreAnalyticsProbe />);

    expect(screen.getByTestId("distribution").textContent).toBe(
      '[{"binIndex":0,"count":0},{"binIndex":1,"count":1}]',
    );
  });
});
