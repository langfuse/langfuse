import type { Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { api } from "../../../utils/api";
import { useScoreAnalyticsQuery } from "./useScoreAnalyticsQuery";

vi.mock("../../../utils/api", () => ({
  api: {
    scoreAnalytics: {
      getScoreComparisonAnalytics: {
        useQuery: vi.fn(),
      },
    },
  },
}));

const mockedUseQuery = api.scoreAnalytics.getScoreComparisonAnalytics
  .useQuery as Mock;

function ScoreAnalyticsProbe({
  includeScore2 = false,
}: {
  includeScore2?: boolean;
}) {
  const score = {
    name: "Correctness",
    dataType: "BOOLEAN" as const,
    source: "ANNOTATION",
  };

  const result = useScoreAnalyticsQuery({
    projectId: "project-test",
    score1: score,
    ...(includeScore2 ? { score2: score } : {}),
    fromTimestamp: new Date("2026-02-01T00:00:00.000Z"),
    toTimestamp: new Date("2026-02-02T00:00:00.000Z"),
    interval: { count: 1, unit: "day" },
  });

  return (
    <div data-testid="distribution">
      {JSON.stringify(result.data?.distribution ?? null)}
    </div>
  );
}

describe("useScoreAnalyticsQuery", () => {
  afterEach(() => {
    mockedUseQuery.mockReset();
  });

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
    const distribution = JSON.parse(
      screen.getByTestId("distribution").textContent ?? "null",
    );

    expect(JSON.stringify(distribution.score1)).toBe(
      '[{"binIndex":0,"count":0},{"binIndex":1,"count":1}]',
    );
  });

  it("keeps score2 boolean distribution aligned when comparing the same score twice", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        counts: { score1Total: 3, score2Total: 3, matchedCount: 3 },
        heatmap: [],
        confusionMatrix: [],
        statistics: null,
        timeSeries: [],
        distribution1: [{ binIndex: 0, count: 3 }],
        distribution2: [{ binIndex: 0, count: 3 }],
        stackedDistribution: [],
        stackedDistributionMatched: [],
        score2Categories: [],
        timeSeriesMatched: [],
        distribution1Matched: [{ binIndex: 0, count: 3 }],
        distribution2Matched: [{ binIndex: 0, count: 3 }],
        distribution1Individual: [{ binIndex: 0, count: 3 }],
        distribution2Individual: [{ binIndex: 0, count: 3 }],
        timeSeriesCategorical1: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "false",
            count: 1,
          },
          {
            timestamp: new Date("2026-02-01T13:00:00.000Z"),
            category: "true",
            count: 2,
          },
        ],
        timeSeriesCategorical2: [],
        timeSeriesCategorical1Matched: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "false",
            count: 1,
          },
          {
            timestamp: new Date("2026-02-01T13:00:00.000Z"),
            category: "true",
            count: 2,
          },
        ],
        timeSeriesCategorical2Matched: [],
        samplingMetadata: {
          isSampled: false,
          samplingMethod: "none",
          samplingRate: 1,
          estimatedTotalMatches: 3,
          actualSampleSize: 3,
          samplingExpression: null,
        },
        metadata: {
          mode: "two",
          isSameScore: true,
          dataType: "BOOLEAN",
        },
      },
      isLoading: false,
      error: null,
    });

    render(<ScoreAnalyticsProbe includeScore2={true} />);
    const distribution = JSON.parse(
      screen.getByTestId("distribution").textContent ?? "null",
    );

    expect(distribution.score1).toEqual(distribution.score2);
    expect(distribution.score2Categories).toEqual(["False", "True"]);
  });
});
