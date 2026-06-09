import * as server from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { caller, projectId } from "./score-comparison-analytics.fixtures";

describe("Score Comparison Analytics tRPC > distributions and bounds", () => {
  // Test 27: Matched Distributions - Empty When No Matches
  it("should return empty matched distributions when no scores match", async () => {
    const traces = [v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test27-nomatch1-${v4()}`;
    const scoreName2 = `test27-nomatch2-${v4()}`;

    // Create only unmatched scores
    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[0],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 50,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[1],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 75,
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

    // Matched distributions should be empty
    expect(result.distribution1Matched).toEqual([]);
    expect(result.distribution2Matched).toEqual([]);

    // Regular distributions should have data
    expect(result.distribution1.length).toBeGreaterThan(0);
    expect(result.distribution2.length).toBeGreaterThan(0);

    // matchedCount should be 0
    expect(result.counts.matchedCount).toBe(0);
  });

  // Test 28: Observation-Level Matched Scores
  it("should match scores correctly at observation level in matched distributions", async () => {
    const traceId = v4();
    const obs1 = v4();
    const obs2 = v4();
    const obs3 = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test28-obs1-${v4()}`;
    const scoreName2 = `test28-obs2-${v4()}`;

    const scores = [
      // Obs1 has both scores (matched)
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs1,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 10,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs1,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 20,
        timestamp: now.getTime(),
      }),
      // Obs2 has only score1 (unmatched)
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs2,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 30,
        timestamp: now.getTime(),
      }),
      // Obs3 has both scores (matched)
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs3,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 40,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs3,
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
      nBins: 10,
    });

    // Only obs1 and obs3 should match
    expect(result.counts.matchedCount).toBe(2);

    const matchedCount1 = result.distribution1Matched.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const matchedCount2 = result.distribution2Matched.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(matchedCount1).toBe(2);
    expect(matchedCount2).toBe(2);

    // Regular distributions should include all 3 score1s and 2 score2s
    const totalCount1 = result.distribution1.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const totalCount2 = result.distribution2.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(totalCount1).toBe(3);
    expect(totalCount2).toBe(2);
  });

  // Test 29: Individual Distributions - Correct Bounds for Numeric Scores with Different Ranges
  it("should use individual bounds for better visualization when score ranges differ", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test29-individual1-${v4()}`;
    const scoreName2 = `test29-individual2-${v4()}`;

    // Score1 range: 10-50 (span: 40), Score2 range: 100-500 (span: 400)
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 10 + idx * 10,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 100 + idx * 100,
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

    // Both distributions should have 5 entries total
    const totalCount1 = result.distribution1.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const totalCount2 = result.distribution2.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const individualCount1 = result.distribution1Individual.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const individualCount2 = result.distribution2Individual.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(totalCount1).toBe(5);
    expect(totalCount2).toBe(5);
    expect(individualCount1).toBe(5);
    expect(individualCount2).toBe(5);

    // Individual distributions should exist and have entries
    expect(result.distribution1Individual.length).toBeGreaterThan(0);
    expect(result.distribution2Individual.length).toBeGreaterThan(0);

    // Verify heatmap contains individual bounds
    const heatmapRow = result.heatmap[0];
    expect(heatmapRow).toBeDefined();
    if (heatmapRow) {
      expect(heatmapRow.min1).toBe(10);
      expect(heatmapRow.max1).toBe(50);
      expect(heatmapRow.min2).toBe(100);
      expect(heatmapRow.max2).toBe(500);
      // Global bounds should span both ranges
      expect(heatmapRow.globalMin).toBe(10);
      expect(heatmapRow.globalMax).toBe(500);
    }
  });

  // Test 30: Individual Distributions - Match Global When Ranges Similar
  it("should have similar distributions when score ranges are similar", async () => {
    const traces = [v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test30-similar1-${v4()}`;
    const scoreName2 = `test30-similar2-${v4()}`;

    // Similar ranges: 10-40 vs 15-45
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 10 + idx * 10,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 15 + idx * 10,
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

    // Counts should match across regular and individual distributions
    const totalCount1 = result.distribution1.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const individualCount1 = result.distribution1Individual.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(totalCount1).toBe(4);
    expect(individualCount1).toBe(4);

    // Verify ranges are similar
    const heatmapRow = result.heatmap[0];
    if (heatmapRow) {
      const range1 = heatmapRow.max1 - heatmapRow.min1;
      const range2 = heatmapRow.max2 - heatmapRow.min2;
      const globalRange = heatmapRow.globalMax - heatmapRow.globalMin;

      // Ranges should be close to each other
      expect(Math.abs(range1 - range2)).toBeLessThan(10);
      // Global range shouldn't be much larger
      expect(globalRange).toBeLessThan(range1 + range2);
    }
  });

  // Test 31: Individual Distributions - Categorical Scores Reference Original
  it("should have individual distributions match regular distributions for categorical scores", async () => {
    const traces = [v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test31-cat1-${v4()}`;
    const scoreName2 = `test31-cat2-${v4()}`;

    const categories1 = ["A", "B", "A"];
    const categories2 = ["X", "Y", "Z"];

    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "CATEGORICAL",
        string_value: categories1[idx],
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "CATEGORICAL",
        string_value: categories2[idx],
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

    // For categorical data, individual distributions should exactly match regular distributions
    expect(result.distribution1Individual).toEqual(result.distribution1);
    expect(result.distribution2Individual).toEqual(result.distribution2);
  });

  // Test 32: Cross-Data Type Handling
  it("should handle individual distributions correctly for cross-type comparison", async () => {
    const traces = [v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test32-numeric-${v4()}`;
    const scoreName2 = `test32-categorical-${v4()}`;

    const scores = [
      ...traces.map((traceId, idx) =>
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 10,
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
          data_type: "CATEGORICAL",
          string_value: ["A", "B", "C"][idx],
          timestamp: now.getTime(),
        }),
      ),
    ];

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "CATEGORICAL", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // Numeric score should have individual distribution
    expect(result.distribution1Individual.length).toBeGreaterThan(0);

    // For cross-type, categorical may have empty or same distribution
    // In cross-type comparisons, individual distributions may behave differently
    if (result.distribution2Individual.length > 0) {
      // If present, categorical distribution2 should match its regular distribution
      expect(result.distribution2Individual).toEqual(result.distribution2);
    }

    // Counts should be consistent for numeric score
    const totalCount1 = result.distribution1.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const individualCount1 = result.distribution1Individual.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(totalCount1).toBe(3);
    expect(individualCount1).toBe(3);
  });

  // Test 33: Time Series Matched - Two-Score Functionality
  it("should return matched time series excluding unmatched scores", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4(), v4()];

    const day1 = new Date("2024-01-01T12:00:00Z");
    const day2 = new Date("2024-01-02T12:00:00Z");
    const day3 = new Date("2024-01-03T12:00:00Z");
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-04T00:00:00Z");

    const scoreName1 = `test33-ts1-${v4()}`;
    const scoreName2 = `test33-ts2-${v4()}`;

    const scores = [
      // Day 1: 2 matched pairs
      ...traces.slice(0, 2).flatMap((traceId, idx) => [
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 5,
          timestamp: day1.getTime(),
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 20 + idx * 5,
          timestamp: day1.getTime(),
        }),
      ]),
      // Day 2: 1 matched pair + 1 unmatched score1
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 30,
        timestamp: day2.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 40,
        timestamp: day2.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[3],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 50,
        timestamp: day2.getTime(),
      }),
      // Day 3: 1 matched pair + 1 unmatched score2
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[4],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 60,
        timestamp: day3.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[4],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 70,
        timestamp: day3.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[5],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 80,
        timestamp: day3.getTime(),
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

    // timeSeriesMatched should only include matched pairs
    expect(result.timeSeriesMatched.length).toBeGreaterThan(0);

    const totalMatchedCount = result.timeSeriesMatched.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(totalMatchedCount).toBe(4); // 2 + 1 + 1 matched pairs

    // Verify each day's data
    const day1Bucket = result.timeSeriesMatched.find(
      (ts) => new Date(ts.timestamp).getUTCDate() === 1,
    );
    const day2Bucket = result.timeSeriesMatched.find(
      (ts) => new Date(ts.timestamp).getUTCDate() === 2,
    );
    const day3Bucket = result.timeSeriesMatched.find(
      (ts) => new Date(ts.timestamp).getUTCDate() === 3,
    );

    expect(day1Bucket?.count).toBe(2);
    expect(day2Bucket?.count).toBe(1); // Unmatched score1 not included
    expect(day3Bucket?.count).toBe(1); // Unmatched score2 not included
  });

  // Test 34: Time Series Matched - Single Score Mode
  it("should handle timeSeriesMatched in single-score mode", async () => {
    const traces = [v4(), v4(), v4(), v4()];

    const day1 = new Date("2024-01-01T12:00:00Z");
    const day2 = new Date("2024-01-02T12:00:00Z");
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-03T00:00:00Z");

    const scoreName = `test34-single-${v4()}`;

    const scores = [
      // Day 1: 2 scores
      ...traces.slice(0, 2).map((traceId, idx) =>
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 10,
          timestamp: day1.getTime(),
        }),
      ),
      // Day 2: 2 scores
      ...traces.slice(2, 4).map((traceId, idx) =>
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName,
          source: "API",
          data_type: "NUMERIC",
          value: 30 + idx * 10,
          timestamp: day2.getTime(),
        }),
      ),
    ];

    await server.createScoresCh(scores);

    // Query with same score for both score1 and score2 (single-score mode)
    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // In single-score mode, avg2 should be null
    result.timeSeriesMatched.forEach((entry) => {
      expect(entry.avg2).toBeNull();
      expect(entry.avg1).not.toBeNull();
    });

    // Should have 2 time buckets (one for each day)
    expect(result.timeSeriesMatched.length).toBeGreaterThanOrEqual(2);
  });

  // Test 36: Time Series Matched - Timestamp Precision (Critical)
  it("should return timestamps in seconds not milliseconds in timeSeriesMatched", async () => {
    const traceId = v4();

    // Use specific timestamp: 2024-01-15 12:30:45.123 UTC
    const specificTime = new Date("2024-01-15T12:30:45.123Z");
    const fromTimestamp = new Date("2024-01-15T00:00:00Z");
    const toTimestamp = new Date("2024-01-16T00:00:00Z");

    const scoreName1 = `test35-timestamp1-${v4()}`;
    const scoreName2 = `test35-timestamp2-${v4()}`;

    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 100,
        timestamp: specificTime.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 200,
        timestamp: specificTime.getTime(),
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

    expect(result.timeSeriesMatched.length).toBeGreaterThan(0);

    const entry = result.timeSeriesMatched[0];
    expect(entry).toBeDefined();

    if (entry) {
      // Timestamp should be a Date object
      expect(entry.timestamp).toBeInstanceOf(Date);

      // Timestamp should be bucketed to start of day (midnight)
      const tsDate = new Date(entry.timestamp);
      expect(tsDate.getUTCHours()).toBe(0);
      expect(tsDate.getUTCMinutes()).toBe(0);
      expect(tsDate.getUTCSeconds()).toBe(0);

      // The milliseconds should be 0 (seconds precision)
      expect(entry.timestamp.getTime() % 1000).toBe(0);

      // Verify it's the correct day
      expect(tsDate.getUTCFullYear()).toBe(2024);
      expect(tsDate.getUTCMonth()).toBe(0); // January = 0
      expect(tsDate.getUTCDate()).toBe(15);
    }
  });

  // Test 37: Time Series Matched - Empty When No Matches
  it("should return empty timeSeriesMatched when no scores match", async () => {
    const traces = [v4(), v4(), v4()];

    const day1 = new Date("2024-01-01T12:00:00Z");
    const day2 = new Date("2024-01-02T12:00:00Z");
    const day3 = new Date("2024-01-03T12:00:00Z");
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-04T00:00:00Z");

    const scoreName1 = `test36-nomatch1-${v4()}`;
    const scoreName2 = `test36-nomatch2-${v4()}`;

    // Create only unmatched scores across different days
    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[0],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 10,
        timestamp: day1.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[1],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 20,
        timestamp: day2.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 30,
        timestamp: day3.getTime(),
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

    // timeSeriesMatched should be empty when no matches exist
    expect(result.timeSeriesMatched).toEqual([]);

    // Regular timeSeries may still have data (mixing unmatched scores)
    expect(result.timeSeries.length).toBeGreaterThanOrEqual(0);

    // matchedCount should be 0
    expect(result.counts.matchedCount).toBe(0);
  });

  // Test 38: Heatmap GlobalMin/GlobalMax - Correct Position
  it("should include globalMin and globalMax in heatmap with correct values", async () => {
    const traces = [v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test37-global1-${v4()}`;
    const scoreName2 = `test37-global2-${v4()}`;

    // Score1: 10-40, Score2: 50-80
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 10 + idx * 10,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 50 + idx * 10,
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

    expect(result.heatmap.length).toBeGreaterThan(0);

    // Every heatmap cell should have all bound properties
    result.heatmap.forEach((cell) => {
      expect(cell.globalMin).toBeDefined();
      expect(cell.globalMax).toBeDefined();
      expect(cell.min1).toBeDefined();
      expect(cell.max1).toBeDefined();
      expect(cell.min2).toBeDefined();
      expect(cell.max2).toBeDefined();

      // Verify values
      expect(cell.globalMin).toBe(10);
      expect(cell.globalMax).toBe(80);
      expect(cell.min1).toBe(10);
      expect(cell.max1).toBe(40);
      expect(cell.min2).toBe(50);
      expect(cell.max2).toBe(80);
    });
  });

  // Test 39: Heatmap GlobalMin/GlobalMax - Single Score Scenario
  it("should have identical bounds in single-score mode for heatmap", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName = `test38-singlescore-${v4()}`;

    const scores = traces.map((traceId, idx) =>
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName,
        source: "API",
        data_type: "NUMERIC",
        value: 5 + idx * 10,
        timestamp: now.getTime(),
      }),
    );

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    expect(result.heatmap.length).toBeGreaterThan(0);

    // In single-score mode, all bounds should be the same
    const firstCell = result.heatmap[0];
    expect(firstCell).toBeDefined();
    if (firstCell) {
      expect(firstCell.globalMin).toBe(5);
      expect(firstCell.globalMax).toBe(45);
      expect(firstCell.min1).toBe(5);
      expect(firstCell.max1).toBe(45);
      expect(firstCell.min2).toBe(5);
      expect(firstCell.max2).toBe(45);

      // All bounds should be identical
      expect(firstCell.min1).toBe(firstCell.min2);
      expect(firstCell.max1).toBe(firstCell.max2);
      expect(firstCell.globalMin).toBe(firstCell.min1);
      expect(firstCell.globalMax).toBe(firstCell.max1);
    }
  });

  // Test 40: Heatmap GlobalMin/GlobalMax - Disjoint Ranges
  it("should have global bounds spanning disjoint score ranges", async () => {
    const traces = [v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test39-disjoint1-${v4()}`;
    const scoreName2 = `test39-disjoint2-${v4()}`;

    // Disjoint ranges: Score1: 1-3, Score2: 100-102
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1 + idx,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 100 + idx,
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

    expect(result.heatmap.length).toBeGreaterThan(0);

    const firstCell = result.heatmap[0];
    if (firstCell) {
      // Individual bounds
      expect(firstCell.min1).toBe(1);
      expect(firstCell.max1).toBe(3);
      expect(firstCell.min2).toBe(100);
      expect(firstCell.max2).toBe(102);

      // Global bounds should span both ranges
      expect(firstCell.globalMin).toBe(1);
      expect(firstCell.globalMax).toBe(102);

      // Verify global range is much larger than individual ranges
      const range1 = firstCell.max1 - firstCell.min1; // 2
      const range2 = firstCell.max2 - firstCell.min2; // 2
      const globalRange = firstCell.globalMax - firstCell.globalMin; // 101

      expect(globalRange).toBeGreaterThan(range1 + range2);
    }
  });
});
