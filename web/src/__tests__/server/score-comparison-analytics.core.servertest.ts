import * as server from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import {
  caller,
  projectId,
  buildEstimateResults,
  createOneHourWindow,
  getScoreComparisonAnalyticsWithPreflight,
  getScoreComparisonAnalytics,
  insertLargeTraceLevelScorePairs,
  insertLargeIdenticalTraceLevelScores,
} from "./score-comparison-analytics.fixtures";

describe("Score Comparison Analytics tRPC > getScoreComparisonAnalytics", () => {
  it("should return all result types with matching scores", async () => {
    const traceId = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000); // 1 hour ago
    const toTimestamp = new Date(now.getTime() + 3600000); // 1 hour from now

    // Use unique score names for test isolation
    const scoreName1 = `test1-score1-${v4()}`;
    const scoreName2 = `test1-score2-${v4()}`;

    // Create two numeric scores on the same trace
    // IMPORTANT: Must set observation_id to null for trace-level scores
    const score1 = server.createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: scoreName1,
      source: "ANNOTATION",
      data_type: "NUMERIC",
      value: 0.8,
      timestamp: now.getTime(),
    });

    const score2 = server.createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: scoreName2,
      source: "ANNOTATION",
      data_type: "NUMERIC",
      value: 0.9,
      timestamp: now.getTime(),
    });

    await server.createScoresCh([score1, score2]);

    const result = await getScoreComparisonAnalyticsWithPreflight({
      projectId,
      score1: {
        name: scoreName1,
        dataType: "NUMERIC",
        source: "ANNOTATION",
      },
      score2: {
        name: scoreName2,
        dataType: "NUMERIC",
        source: "ANNOTATION",
      },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // Verify all result types are present
    expect(result.counts).toBeDefined();
    expect(result.counts.score1Total).toBe(1);
    expect(result.counts.score2Total).toBe(1);
    expect(result.counts.matchedCount).toBe(1);

    expect(result.heatmap).toBeDefined();
    expect(Array.isArray(result.heatmap)).toBe(true);

    expect(result.confusionMatrix).toBeDefined();
    expect(Array.isArray(result.confusionMatrix)).toBe(true);

    expect(result.statistics).toBeDefined();
    expect(result.statistics).not.toBeNull();
    if (result.statistics) {
      expect(result.statistics.pearsonCorrelation).toBeDefined();
      expect(result.statistics.spearmanCorrelation).toBeDefined();
    }

    expect(result.timeSeries).toBeDefined();
    expect(Array.isArray(result.timeSeries)).toBe(true);

    expect(result.distribution1).toBeDefined();
    expect(Array.isArray(result.distribution1)).toBe(true);

    expect(result.distribution2).toBeDefined();
    expect(Array.isArray(result.distribution2)).toBe(true);

    // Verify sampling metadata is present
    expect(result.samplingMetadata).toBeDefined();
    expect(result.samplingMetadata.isSampled).toBe(false); // No sampling for small dataset
    expect(result.samplingMetadata.samplingMethod).toBe("none");
    expect(result.samplingMetadata.samplingRate).toBe(1.0);
    expect(
      result.samplingMetadata.estimatedTotalMatches,
    ).toBeGreaterThanOrEqual(0);
    expect(result.samplingMetadata.actualSampleSize).toBe(1); // Matches matchedCount
    expect(result.samplingMetadata.samplingExpression).toBeNull();
  });

  // Test 2: Returns empty results when no scores exist
  it("should return empty results when no scores in time range", async () => {
    const fromTimestamp = new Date("2020-01-01");
    const toTimestamp = new Date("2020-01-02");

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: {
        name: "nonexistent1",
        dataType: "NUMERIC",
        source: "API",
      },
      score2: {
        name: "nonexistent2",
        dataType: "NUMERIC",
        source: "API",
      },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.counts.score1Total).toBe(0);
    expect(result.counts.score2Total).toBe(0);
    expect(result.counts.matchedCount).toBe(0);
    expect(result.heatmap).toEqual([]);
    expect(result.confusionMatrix).toEqual([]);
    expect(result.timeSeries).toEqual([]);
    expect(result.distribution1).toEqual([]);
    expect(result.distribution2).toEqual([]);

    // Verify sampling metadata even when no data
    expect(result.samplingMetadata).toBeDefined();
    expect(result.samplingMetadata.isSampled).toBe(false);
    expect(result.samplingMetadata.samplingMethod).toBe("none");
    expect(result.samplingMetadata.actualSampleSize).toBe(0);
  });

  // Test 3: Validates input schema
  it("should reject invalid nBins values", async () => {
    const now = new Date();

    await expect(
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        projectId,
        score1: {
          name: "score1",
          dataType: "NUMERIC",
          source: "API",
        },
        score2: {
          name: "score2",
          dataType: "NUMERIC",
          source: "API",
        },
        fromTimestamp: now,
        toTimestamp: now,
        interval: { count: 1, unit: "day" },
        nBins: 3, // Too small
      }),
    ).rejects.toThrow();

    await expect(
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        projectId,
        score1: {
          name: "score1",
          dataType: "NUMERIC",
          source: "API",
        },
        score2: {
          name: "score2",
          dataType: "NUMERIC",
          source: "API",
        },
        fromTimestamp: now,
        toTimestamp: now,
        interval: { count: 1, unit: "day" },
        nBins: 100, // Too large
      }),
    ).rejects.toThrow();
  });

  // Test 4: Adaptive FINAL optimization with small dataset
  // For datasets with estimated counts < 100k: uses FINAL for accuracy
  // For datasets with estimated counts >= 100k: skips FINAL for performance
  it("should use FINAL for small datasets (adaptive FINAL)", async () => {
    const traceId = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test-adaptive-score1-${v4()}`;
    const scoreName2 = `test-adaptive-score2-${v4()}`;

    // Create a small dataset (will use FINAL)
    const score1 = server.createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: scoreName1,
      source: "ANNOTATION",
      data_type: "NUMERIC",
      value: 0.5,
      timestamp: now.getTime(),
    });

    const score2 = server.createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: scoreName2,
      source: "ANNOTATION",
      data_type: "NUMERIC",
      value: 0.6,
      timestamp: now.getTime(),
    });

    await server.createScoresCh([score1, score2]);

    const result = await getScoreComparisonAnalyticsWithPreflight({
      projectId,
      score1: {
        name: scoreName1,
        dataType: "NUMERIC",
        source: "ANNOTATION",
      },
      score2: {
        name: scoreName2,
        dataType: "NUMERIC",
        source: "ANNOTATION",
      },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // Verify query succeeded
    expect(result.counts).toBeDefined();
    expect(result.counts.matchedCount).toBe(1);

    // Verify adaptive FINAL decision via samplingMetadata
    expect(result.samplingMetadata.adaptiveFinal).toBeDefined();
    expect(result.samplingMetadata.adaptiveFinal?.usedFinal).toBe(true);
    expect(result.samplingMetadata.adaptiveFinal?.reason).toContain(
      "Small dataset - using FINAL for accuracy",
    );

    // Verify preflight estimates are included
    expect(result.samplingMetadata.preflightEstimates).toBeDefined();
    expect(
      result.samplingMetadata.preflightEstimates?.score1Count,
    ).toBeLessThan(100_000);
    expect(
      result.samplingMetadata.preflightEstimates?.score2Count,
    ).toBeLessThan(100_000);
  });

  // Test 5: Large estimated datasets should skip FINAL and use hash sampling
  it("should skip FINAL and apply hash-based sampling for large estimate results", async () => {
    const { fromTimestamp, toTimestamp } = createOneHourWindow();
    const scoreName1 = `test-large-score1-${v4()}`;
    const scoreName2 = `test-large-score2-${v4()}`;
    const totalRows = 10_000;
    const forcedEstimateResults = buildEstimateResults(101_000);

    await insertLargeTraceLevelScorePairs({
      totalRows,
      scoreName1,
      scoreName2,
    });

    const result = await getScoreComparisonAnalytics({
      projectId,
      score1: {
        name: scoreName1,
        dataType: "NUMERIC",
        source: "ANNOTATION",
      },
      score2: {
        name: scoreName2,
        dataType: "NUMERIC",
        source: "ANNOTATION",
      },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "hour" as const },
      objectType: "all",
      estimateResults: forcedEstimateResults,
    });

    expect(result.counts).toBeDefined();
    expect(
      result.samplingMetadata.preflightEstimates?.score1Count,
    ).toBeGreaterThan(100_000);
    expect(
      result.samplingMetadata.preflightEstimates?.score2Count,
    ).toBeGreaterThan(100_000);
    expect(
      result.samplingMetadata.preflightEstimates?.estimatedMatchedCount,
    ).toBeGreaterThan(100_000);

    expect(result.samplingMetadata.adaptiveFinal?.usedFinal).toBe(false);
    expect(result.samplingMetadata.adaptiveFinal?.reason).toContain(
      "Large dataset - skipping FINAL for performance",
    );

    expect(result.samplingMetadata.isSampled).toBe(true);
    expect(result.samplingMetadata.samplingMethod).toBe("hash");
    expect(result.samplingMetadata.samplingRate).toBeLessThan(1);
    expect(result.samplingMetadata.samplingRate).toBeGreaterThan(0);
    expect(result.samplingMetadata.samplingExpression).toContain("cityHash64");
    expect(result.samplingMetadata.actualSampleSize).toBeGreaterThan(0);
    expect(result.samplingMetadata.actualSampleSize).toBeLessThanOrEqual(
      totalRows,
    );

    expect(result.counts.score1Total).toBe(result.counts.score2Total);
    expect(result.counts.matchedCount).toBe(result.counts.score1Total);
    expect(result.counts.matchedCount).toBe(
      result.samplingMetadata.actualSampleSize,
    );
    expect(result.heatmap.length).toBeGreaterThan(0);
    expect(result.timeSeries.length).toBeGreaterThan(0);
  }, 120000);

  // Test 6: Identical scores should stay perfectly aligned under sampling
  it("should return perfect correlation for identical scores with sampling", async () => {
    const { fromTimestamp, toTimestamp } = createOneHourWindow();
    const scoreName = `test-identical-${v4()}`;
    const totalRows = 5_000;
    const forcedEstimateResults = buildEstimateResults(120_000);

    await insertLargeIdenticalTraceLevelScores({
      totalRows,
      scoreName,
    });

    // Compare score to itself
    const result = await getScoreComparisonAnalytics({
      projectId,
      score1: {
        name: scoreName,
        source: "ANNOTATION",
        dataType: "NUMERIC",
      },
      score2: {
        name: scoreName,
        source: "ANNOTATION",
        dataType: "NUMERIC",
      },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "hour" as const },
      objectType: "all",
      estimateResults: forcedEstimateResults,
    });

    expect(result.samplingMetadata.isSampled).toBe(true);
    expect(result.samplingMetadata.samplingMethod).toBe("hash");

    expect(result.counts.score1Total).toBe(result.counts.score2Total);
    expect(result.counts.matchedCount).toBe(result.counts.score1Total);
    expect(result.counts.matchedCount).toBe(result.counts.score2Total);
    expect(result.counts.matchedCount).toBeGreaterThan(0);
    expect(result.counts.matchedCount).toBeLessThan(totalRows);

    const offDiagonalPoints = result.heatmap.filter(
      (point) => point.binX !== point.binY,
    );
    expect(offDiagonalPoints.length).toBe(0);

    expect(result.statistics?.spearmanCorrelation).toBeNull();
  }, 120000);

  // Test 9: Calculates counts correctly with partial matches
  it("should calculate counts correctly with partial matches", async () => {
    const trace1 = v4();
    const trace2 = v4();
    const trace3 = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test4-s1-${v4()}`;
    const scoreName2 = `test4-s2-${v4()}`;

    // Create scores: trace1 has both, trace2 has only score1, trace3 has only score2
    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1.0,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2.0,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3.0,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace3,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 4.0,
        timestamp: now.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.counts.score1Total).toBe(2); // trace1, trace2
    expect(result.counts.score2Total).toBe(2); // trace1, trace3
    expect(result.counts.matchedCount).toBe(1); // only trace1 has both
  });

  // Test 5: Handles unmatched scores correctly
  it("should handle case where no scores match", async () => {
    const trace1 = v4();
    const trace2 = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test5-isolated1-${v4()}`;
    const scoreName2 = `test5-isolated2-${v4()}`;

    // trace1 has only score1, trace2 has only score2
    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1.0,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2.0,
        timestamp: now.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.counts.score1Total).toBe(1);
    expect(result.counts.score2Total).toBe(1);
    expect(result.counts.matchedCount).toBe(0);
  });

  // Test 6: Generates correct bins for heatmap
  it("should generate correct bins for numeric heatmap", async () => {
    const traces = [v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test6-scoreA-${v4()}`;
    const scoreName2 = `test6-scoreB-${v4()}`;

    // Create 4 matched pairs with known values: (0,0), (25,25), (50,50), (100,100)
    const scores = traces.flatMap((traceId, idx) => {
      const value = idx * 25;
      return [
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: value,
          timestamp: now.getTime(),
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: value,
          timestamp: now.getTime(),
        }),
      ];
    });

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.heatmap.length).toBeGreaterThan(0);

    // Each heatmap cell should have binX, binY, count, and min/max ranges
    result.heatmap.forEach((cell) => {
      expect(cell.binX).toBeGreaterThanOrEqual(0);
      expect(cell.binX).toBeLessThan(10);
      expect(cell.binY).toBeGreaterThanOrEqual(0);
      expect(cell.binY).toBeLessThan(10);
      expect(cell.count).toBeGreaterThan(0);
      expect(cell.min1).toBeDefined();
      expect(cell.max1).toBeDefined();
      expect(cell.min2).toBeDefined();
      expect(cell.max2).toBeDefined();
    });

    // Total count across heatmap should equal matched count
    const totalHeatmapCount = result.heatmap.reduce(
      (sum, cell) => sum + cell.count,
      0,
    );
    expect(totalHeatmapCount).toBe(result.counts.matchedCount);
  });

  // Test 7: Respects custom nBins parameter
  it("should respect a custom nBins value", async () => {
    const traceId = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test7-binTest1-${v4()}`;
    const scoreName2 = `test7-binTest2-${v4()}`;

    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 50,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 50,
        timestamp: now.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 5,
    });

    result.heatmap.forEach((cell) => {
      expect(cell.binX).toBeLessThan(5);
      expect(cell.binY).toBeLessThan(5);
    });
  });

  // Test 8: Includes min/max ranges for heatmap bins
  it("should include accurate min/max ranges for each heatmap bin", async () => {
    const traces = [v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test8-rangeA-${v4()}`;
    const scoreName2 = `test8-rangeB-${v4()}`;

    // Create scores with known values: (10,20), (15,25), (18,28)
    const scores = [
      ...traces.map((traceId, idx) =>
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 5,
          timestamp: now.getTime(),
        }),
      ),
      ...traces.map((traceId, idx) =>
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 20 + idx * 5,
          timestamp: now.getTime(),
        }),
      ),
    ];

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // Verify that min/max ranges make sense
    result.heatmap.forEach((cell) => {
      expect(cell.max1).toBeGreaterThanOrEqual(cell.min1);
      expect(cell.max2).toBeGreaterThanOrEqual(cell.min2);
    });
  });

  // Test 9: Generates confusion matrix for BOOLEAN scores
  it("should generate 2x2 confusion matrix for BOOLEAN scores", async () => {
    const traces = [v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test9-boolA-${v4()}`;
    const scoreName2 = `test9-boolB-${v4()}`;

    // Create all four combinations: (T,T), (T,F), (F,T), (F,F)
    const combinations = [
      { val1: 1, val2: 1 }, // True, True
      { val1: 1, val2: 0 }, // True, False
      { val1: 0, val2: 1 }, // False, True
      { val1: 0, val2: 0 }, // False, False
    ];

    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "BOOLEAN",
        value: combinations[idx].val1,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "BOOLEAN",
        value: combinations[idx].val2,
        timestamp: now.getTime(),
      }),
    ]);

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "BOOLEAN", source: "API" },
      score2: { name: scoreName2, dataType: "BOOLEAN", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // Should have confusion matrix entries
    expect(result.confusionMatrix.length).toBeGreaterThan(0);

    // Each entry should have rowCategory, colCategory, and count
    result.confusionMatrix.forEach((entry) => {
      expect(entry.rowCategory).toBeDefined();
      expect(entry.colCategory).toBeDefined();
      expect(entry.count).toBeGreaterThan(0);
    });

    // Total count should equal matched count
    const totalConfusionCount = result.confusionMatrix.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(totalConfusionCount).toBe(result.counts.matchedCount);
  });

  // Test 10: Generates confusion matrix for CATEGORICAL scores
  it("should generate NxN confusion matrix for CATEGORICAL scores", async () => {
    const traces = [v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test10-catA-${v4()}`;
    const scoreName2 = `test10-catB-${v4()}`;

    // Create categorical scores: (A,A), (A,B), (B,B)
    const categories = [
      { cat1: "A", cat2: "A" },
      { cat1: "A", cat2: "B" },
      { cat1: "B", cat2: "B" },
    ];

    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "CATEGORICAL",
        string_value: categories[idx].cat1,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "CATEGORICAL",
        string_value: categories[idx].cat2,
        timestamp: now.getTime(),
      }),
    ]);

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "CATEGORICAL", source: "API" },
      score2: { name: scoreName2, dataType: "CATEGORICAL", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.confusionMatrix.length).toBeGreaterThan(0);

    // Should have entries for (A,A), (A,B), (B,B)
    const aaEntry = result.confusionMatrix.find(
      (e) => e.rowCategory === "A" && e.colCategory === "A",
    );
    const abEntry = result.confusionMatrix.find(
      (e) => e.rowCategory === "A" && e.colCategory === "B",
    );
    const bbEntry = result.confusionMatrix.find(
      (e) => e.rowCategory === "B" && e.colCategory === "B",
    );

    expect(aaEntry).toBeDefined();
    expect(abEntry).toBeDefined();
    expect(bbEntry).toBeDefined();

    if (aaEntry && abEntry && bbEntry) {
      expect(aaEntry.count).toBe(1);
      expect(abEntry.count).toBe(1);
      expect(bbEntry.count).toBe(1);
    }
  });

  // Test 11: Calculates perfect correlation correctly
  it("should calculate perfect correlation for identical scores", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test11-perfect1-${v4()}`;
    const scoreName2 = `test11-perfect2-${v4()}`;

    // Create identical scores
    const scores = traces.flatMap((traceId, idx) => {
      const value = idx * 10;
      return [
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: value,
          timestamp: now.getTime(),
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: value,
          timestamp: now.getTime(),
        }),
      ];
    });

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.statistics).toBeDefined();
    expect(result.statistics).not.toBeNull();
    if (result.statistics) {
      expect(result.statistics.pearsonCorrelation).toBeCloseTo(1.0, 2);
      expect(result.statistics.spearmanCorrelation).toBeCloseTo(1.0, 2);
      expect(result.statistics.mae).toBeCloseTo(0, 2);
      expect(result.statistics.rmse).toBeCloseTo(0, 2);
    }
  });

  // Test 12: Calculates statistics with known correlation
  it("should calculate statistics correctly for known dataset", async () => {
    const traces = [v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test12-linear1-${v4()}`;
    const scoreName2 = `test12-linear2-${v4()}`;

    // Create known dataset: (1,2), (2,4), (3,6), (4,8) - perfect linear relationship
    const values = [1, 2, 3, 4];
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: values[idx],
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: values[idx] * 2,
        timestamp: now.getTime(),
      }),
    ]);

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.statistics).not.toBeNull();
    if (result.statistics) {
      // Perfect linear correlation should be 1.0
      expect(result.statistics.pearsonCorrelation).toBeCloseTo(1.0, 2);
      expect(result.statistics.spearmanCorrelation).toBeCloseTo(1.0, 2);

      // MAE for y=2x should be 0
      expect(result.statistics.mae).toBeGreaterThan(0);

      // RMSE should also be > 0
      expect(result.statistics.rmse).toBeGreaterThan(0);
    }
  });
});
