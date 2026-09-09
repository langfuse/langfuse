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

function NumericScoreAnalyticsProbe() {
  const result = useScoreAnalyticsQuery({
    projectId: "project-test",
    score1: { name: "accuracy-a", dataType: "NUMERIC", source: "API" },
    score2: { name: "accuracy-b", dataType: "NUMERIC", source: "API" },
    fromTimestamp: new Date("2026-02-01T00:00:00.000Z"),
    toTimestamp: new Date("2026-02-02T00:00:00.000Z"),
    interval: { count: 1, unit: "day" },
  });

  return (
    <div data-testid="bin-labels">
      {JSON.stringify(result.data?.distribution?.binLabelsGlobal ?? null)}
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

  it("keeps numeric bin labels within the real data bounds when there are no matched pairs", () => {
    // Regression test for #13331: when comparing two numeric scores that share
    // no attachment points (matchedCount = 0), the heatmap is empty. The bin
    // labels must be derived from the actual data bounds returned by the
    // backend, NOT estimated from mean ± 3·std (which produced an x-axis of
    // roughly -0.08 to 1.70 for scores bounded to [0, 1]).
    mockedUseQuery.mockReturnValue({
      data: {
        counts: { score1Total: 20, score2Total: 20, matchedCount: 0 },
        // No matched pairs -> heatmap is empty, so the fallback path runs.
        heatmap: [],
        confusionMatrix: [],
        statistics: {
          matchedCount: 0,
          mean1: 0.81,
          mean2: 0.79,
          std1: 0.29,
          std2: 0.29,
          pearsonCorrelation: null,
          mae: null,
          rmse: null,
          spearmanCorrelation: null,
        },
        // Real data bounds, always available even without matched pairs.
        bounds: {
          globalMin: 0,
          globalMax: 1,
          min1: 0,
          max1: 1,
          min2: 0,
          max2: 1,
        },
        timeSeries: [],
        distribution1: [{ binIndex: 0, count: 10 }],
        distribution2: [{ binIndex: 9, count: 10 }],
        stackedDistribution: [],
        stackedDistributionMatched: [],
        score2Categories: [],
        timeSeriesMatched: [],
        distribution1Matched: [],
        distribution2Matched: [],
        distribution1Individual: [{ binIndex: 0, count: 10 }],
        distribution2Individual: [{ binIndex: 9, count: 10 }],
        timeSeriesCategorical1: [],
        timeSeriesCategorical2: [],
        timeSeriesCategorical1Matched: [],
        timeSeriesCategorical2Matched: [],
        samplingMetadata: {
          isSampled: false,
          samplingMethod: "none",
          samplingRate: 1,
          estimatedTotalMatches: 0,
          actualSampleSize: 0,
          samplingExpression: null,
        },
        metadata: {
          mode: "two",
          isSameScore: false,
          dataType: "NUMERIC",
        },
      },
      isLoading: false,
      error: null,
    });

    render(<NumericScoreAnalyticsProbe />);
    const binLabels: string[] | null = JSON.parse(
      screen.getByTestId("bin-labels").textContent ?? "null",
    );

    expect(binLabels).not.toBeNull();
    expect(binLabels).toHaveLength(10);

    // Parse every numeric edge out of the labels (e.g. "0.90 - 1.00").
    const edges = (binLabels ?? []).flatMap((label) =>
      label.split(" - ").map((part) => Number.parseFloat(part)),
    );

    // Buckets must stay inside the real [0, 1] data range, never overshoot into
    // the -0.08..1.70 range produced by the mean ± 3·std estimate.
    expect(Math.min(...edges)).toBeCloseTo(0, 5);
    expect(Math.max(...edges)).toBeCloseTo(1, 5);
    expect(edges.every((edge) => edge >= -1e-9 && edge <= 1 + 1e-9)).toBe(true);
  });
});
