import type { Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { api } from "../../../utils/api";
import { useScoreAnalyticsQuery } from "./useScoreAnalyticsQuery";
import {
  buildNumericDistributionChartData,
  formatDistributionDecimal,
  generateBinLabels,
} from "../lib/score-analytics-transformers";

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

function ScoreAnalyticsTimeSeriesProbe({
  includeScore2 = false,
}: {
  includeScore2?: boolean;
}) {
  const score1 = {
    name: "metric_1",
    dataType: "BOOLEAN" as const,
    source: "ANNOTATION",
  };
  const score2 = {
    name: "metric_11",
    dataType: "BOOLEAN" as const,
    source: "ANNOTATION",
  };

  const result = useScoreAnalyticsQuery({
    projectId: "project-test",
    score1,
    ...(includeScore2 ? { score2 } : {}),
    fromTimestamp: new Date("2026-02-01T00:00:00.000Z"),
    toTimestamp: new Date("2026-02-02T00:00:00.000Z"),
    interval: { count: 1, unit: "day" },
  });

  return (
    <div data-testid="timeseries">
      {JSON.stringify(result.data?.timeSeries.categorical ?? null)}
    </div>
  );
}

describe("useScoreAnalyticsQuery", () => {
  it("formats numeric distribution bins with at most one decimal and no trailing zeros", () => {
    expect(generateBinLabels({ min: 0, max: 1, nBins: 10 })).toEqual([
      "0 - 0.1",
      "0.1 - 0.2",
      "0.2 - 0.3",
      "0.3 - 0.4",
      "0.4 - 0.5",
      "0.5 - 0.6",
      "0.6 - 0.7",
      "0.7 - 0.8",
      "0.8 - 0.9",
      "0.9 - 1",
    ]);
  });

  it("renders a rounded signed zero as 0", () => {
    expect(formatDistributionDecimal(-0.04)).toBe("0");
    expect(formatDistributionDecimal(-0)).toBe("0");
    expect(formatDistributionDecimal(0.04)).toBe("0");
    expect(formatDistributionDecimal(0.917)).toBe("0.9");
    expect(formatDistributionDecimal(-0.05)).toBe("-0.1");
    expect(generateBinLabels({ min: -0.2, max: 0.2, nBins: 10 })).toEqual([
      "-0.2 - -0.2",
      "-0.2 - -0.1",
      "-0.1 - -0.1",
      "-0.1 - 0",
      "0 - 0",
      "0 - 0",
      "0 - 0.1",
      "0.1 - 0.1",
      "0.1 - 0.2",
      "0.2 - 0.2",
    ]);
    expect(generateBinLabels({ min: -1, max: 0, nBins: 10 })).toEqual([
      "-1 - -0.9",
      "-0.9 - -0.8",
      "-0.8 - -0.7",
      "-0.7 - -0.6",
      "-0.6 - -0.5",
      "-0.5 - -0.4",
      "-0.4 - -0.3",
      "-0.3 - -0.2",
      "-0.2 - -0.1",
      "-0.1 - 0",
    ]);
  });

  it("keeps distribution bins distinct when one-decimal labels repeat", () => {
    const binLabels = generateBinLabels({ min: 0.8, max: 1, nBins: 10 });
    const distribution1 = binLabels.map((_, binIndex) => ({
      binIndex,
      count: binIndex + 1,
    }));
    const distribution2 = binLabels.map((_, binIndex) => ({
      binIndex,
      count: 20 - binIndex,
    }));
    const chart = buildNumericDistributionChartData({
      distribution1,
      distribution2,
      binLabels,
    });
    const keys = chart.data.map((row) => row.key);

    expect(new Set(keys).size).toBe(chart.data.length);

    const labels = chart.data.map((row) => chart.labelForKey(row.key));
    expect(
      labels.filter((label) => label === "0.8 - 0.8").length,
    ).toBeGreaterThan(1);
    const repeated = chart.data
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => chart.labelForKey(row.key) === "0.9 - 0.9");
    expect(repeated.length).toBeGreaterThan(1);
    expect(repeated[0]?.row.key).not.toBe(repeated[1]?.row.key);
    expect(repeated[0]?.row.values).toEqual({
      score1: (repeated[0]?.index ?? 0) + 1,
      score2: 20 - (repeated[0]?.index ?? 0),
    });
    expect(chart.labelForKey(chart.data[3]?.key ?? "")).toBe(binLabels[3]);

    const single = buildNumericDistributionChartData({
      distribution1,
      binLabels,
    });
    expect(single.data[0]?.values).toEqual({ score1: 1 });
    expect(single.data[0]?.values).not.toHaveProperty("score2");

    const flatLabels = generateBinLabels({ min: 0, max: 0, nBins: 10 });
    const flat = buildNumericDistributionChartData({
      distribution1: flatLabels.map((_, binIndex) => ({ binIndex, count: 1 })),
      binLabels: flatLabels,
    });
    expect(new Set(flat.data.map((row) => row.key)).size).toBe(
      flat.data.length,
    );
    expect(flat.data.map((row) => flat.labelForKey(row.key))).toEqual(
      flatLabels,
    );
  });

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

  it("normalizes lowercase boolean category names in time series to Title-case", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        counts: { score1Total: 2, score2Total: 0, matchedCount: 0 },
        heatmap: [],
        confusionMatrix: [],
        statistics: null,
        timeSeries: [],
        distribution1: [],
        distribution2: [],
        stackedDistribution: [],
        stackedDistributionMatched: [],
        score2Categories: [],
        timeSeriesMatched: [],
        distribution1Matched: [],
        distribution2Matched: [],
        distribution1Individual: [],
        distribution2Individual: [],
        timeSeriesCategorical1: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "true",
            count: 1,
          },
          {
            timestamp: new Date("2026-02-01T13:00:00.000Z"),
            category: "false",
            count: 1,
          },
        ],
        timeSeriesCategorical2: [],
        timeSeriesCategorical1Matched: [],
        timeSeriesCategorical2Matched: [],
        samplingMetadata: {
          isSampled: false,
          samplingMethod: "none",
          samplingRate: 1,
          estimatedTotalMatches: 2,
          actualSampleSize: 2,
          samplingExpression: null,
        },
        metadata: { mode: "single", isSameScore: true, dataType: "BOOLEAN" },
      },
      isLoading: false,
      error: null,
    });

    render(<ScoreAnalyticsTimeSeriesProbe />);
    const ts = JSON.parse(
      screen.getByTestId("timeseries").textContent ?? "null",
    );

    const score1Categories = (ts.score1 as Array<{ category: string }>).map(
      (item) => item.category,
    );
    expect(score1Categories).not.toContain("true");
    expect(score1Categories).not.toContain("false");
    expect(score1Categories).toContain("True");
    expect(score1Categories).toContain("False");
  });

  it("normalizes boolean categories in two-score mode so namespaced color keys resolve correctly", () => {
    mockedUseQuery.mockReturnValue({
      data: {
        counts: { score1Total: 2, score2Total: 2, matchedCount: 0 },
        heatmap: [],
        confusionMatrix: [],
        statistics: null,
        timeSeries: [],
        distribution1: [],
        distribution2: [],
        stackedDistribution: [],
        stackedDistributionMatched: [],
        score2Categories: [],
        timeSeriesMatched: [],
        distribution1Matched: [],
        distribution2Matched: [],
        distribution1Individual: [],
        distribution2Individual: [],
        timeSeriesCategorical1: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "true",
            count: 1,
          },
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "false",
            count: 1,
          },
        ],
        timeSeriesCategorical2: [
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "true",
            count: 1,
          },
          {
            timestamp: new Date("2026-02-01T12:00:00.000Z"),
            category: "false",
            count: 1,
          },
        ],
        timeSeriesCategorical1Matched: [],
        timeSeriesCategorical2Matched: [],
        samplingMetadata: {
          isSampled: false,
          samplingMethod: "none",
          samplingRate: 1,
          estimatedTotalMatches: 2,
          actualSampleSize: 2,
          samplingExpression: null,
        },
        metadata: { mode: "two", isSameScore: false, dataType: "BOOLEAN" },
      },
      isLoading: false,
      error: null,
    });

    render(<ScoreAnalyticsTimeSeriesProbe includeScore2={true} />);
    const ts = JSON.parse(
      screen.getByTestId("timeseries").textContent ?? "null",
    );

    // "all" tab merges score1 and score2 with namespaced keys: "metric_1: True", "metric_11: True", etc.
    const allCategories = (ts.all as Array<{ category: string }>).map(
      (item) => item.category,
    );
    expect(allCategories).toContain("metric_1: True");
    expect(allCategories).toContain("metric_1: False");
    expect(allCategories).toContain("metric_11: True");
    expect(allCategories).toContain("metric_11: False");
    // No lowercase variants should be present
    expect(allCategories).not.toContain("metric_1: true");
    expect(allCategories).not.toContain("metric_11: false");
  });
});
