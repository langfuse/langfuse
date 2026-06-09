import * as server from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { caller, projectId } from "./score-comparison-analytics.fixtures";

describe("Score Comparison Analytics tRPC > time series", () => {
  // Test 13: Aggregates time series by hour
  it("should aggregate time series correctly by hour", async () => {
    const traceId = v4();

    const baseTime = new Date("2024-01-01T10:00:00Z");
    const fromTimestamp = new Date("2024-01-01T09:00:00Z");
    const toTimestamp = new Date("2024-01-01T13:00:00Z");

    const scoreName1 = `test13-hourly1-${v4()}`;
    const scoreName2 = `test13-hourly2-${v4()}`;

    // Create scores at different hours: 10:00, 10:30, 11:00, 12:00
    const timestamps = [
      baseTime.getTime(),
      baseTime.getTime() + 1800000, // +30 min
      baseTime.getTime() + 3600000, // +1 hour
      baseTime.getTime() + 7200000, // +2 hours
    ];

    const scores = timestamps.flatMap((ts) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: v4(),
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: ts,
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: v4(),
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: ts,
      }),
    ]);

    // Create matching pairs by using same trace IDs
    const matchedScores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: timestamps[0],
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: timestamps[0],
      }),
    ];

    await server.createScoresCh([...scores, ...matchedScores]);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "hour" },
      nBins: 10,
    });

    expect(result.timeSeries.length).toBeGreaterThan(0);

    // Each time series entry should have timestamp, avg1, avg2, and count
    result.timeSeries.forEach((entry) => {
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.count).toBeGreaterThan(0);
    });
  });

  // Test 14: Aggregates time series by day
  it("should aggregate time series correctly by day", async () => {
    const traces = [v4(), v4(), v4()];

    const day1 = new Date("2024-01-01T12:00:00Z");
    const day2 = new Date("2024-01-02T12:00:00Z");
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-04T00:00:00Z");

    const scoreName1 = `test14-daily1-${v4()}`;
    const scoreName2 = `test14-daily2-${v4()}`;

    // Create scores across 3 days
    const scores = [
      ...traces.slice(0, 2).flatMap((traceId) => [
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: day1.getTime(),
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 2,
          timestamp: day1.getTime(),
        }),
      ]),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: day2.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: day2.getTime(),
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

    expect(result.timeSeries.length).toBeGreaterThanOrEqual(2);

    // Total count across MATCHED time series should equal matched count
    // Note: timeSeries (ALL) includes unmatched scores, so we check timeSeriesMatched
    const totalMatchedTimeSeriesCount = result.timeSeriesMatched.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(totalMatchedTimeSeriesCount).toBe(result.counts.matchedCount);
  });

  // Test 15: Aggregates time series by week and month
  it("should aggregate time series correctly by week and month", async () => {
    const traceId = v4();

    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-03-01T00:00:00Z");

    const scoreName1 = `test15-period1-${v4()}`;
    const scoreName2 = `test15-period2-${v4()}`;

    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const [weekResult, monthResult] = await Promise.all([
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 7, unit: "day" },
        nBins: 10,
      }),
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "month" },
        nBins: 10,
      }),
    ]);

    expect(weekResult.timeSeries.length).toBeGreaterThan(0);
    expect(monthResult.timeSeries.length).toBeGreaterThan(0);
  });

  // Test 16: Calculates distribution1 accurately
  it("should calculate distribution for first score accurately", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test16-dist1-${v4()}`;
    const scoreName2 = `test16-dist2-${v4()}`;

    // Create 5 scores with known values: 0, 25, 50, 75, 100
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: idx * 25,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 50, // constant
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

    expect(result.distribution1.length).toBeGreaterThan(0);

    // Each distribution entry should have binIndex and count
    result.distribution1.forEach((entry) => {
      expect(entry.binIndex).toBeGreaterThanOrEqual(0);
      expect(entry.binIndex).toBeLessThan(10);
      expect(entry.count).toBeGreaterThan(0);
    });

    // Total count should equal score1Total
    const totalDist1Count = result.distribution1.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(totalDist1Count).toBe(result.counts.score1Total);
  });

  // Test 17: Calculates distribution2 accurately
  it("should calculate distribution for second score accurately", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test17-distA-${v4()}`;
    const scoreName2 = `test17-distB-${v4()}`;

    // Create 5 scores with known values
    const scores = traces.flatMap((traceId, idx) => [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 50, // constant
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: idx * 20,
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

    expect(result.distribution2.length).toBeGreaterThan(0);

    // Total count should equal score2Total
    const totalDist2Count = result.distribution2.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(totalDist2Count).toBe(result.counts.score2Total);
  });

  // Test 18: Matches scores on trace level
  it("should match scores correctly at trace level", async () => {
    const trace1 = v4();
    const trace2 = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test18-traceLevel1-${v4()}`;
    const scoreName2 = `test18-traceLevel2-${v4()}`;

    const scores = [
      // Trace 1 has both scores
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: now.getTime(),
      }),
      // Trace 2 has only one score
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3,
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

    // Only trace1 should match
    expect(result.counts.matchedCount).toBe(1);
  });

  // Test 19: Matches scores on observation level
  it("should match scores correctly at observation level", async () => {
    const traceId = v4();
    const obs1 = v4();
    const obs2 = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test19-obsLevel1-${v4()}`;
    const scoreName2 = `test19-obsLevel2-${v4()}`;

    const scores = [
      // obs1 has both scores
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs1,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs1,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: now.getTime(),
      }),
      // obs2 has only one score
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: obs2,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3,
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

    // Only obs1 should match
    expect(result.counts.matchedCount).toBe(1);
  });

  // Test 20: Matches scores on session level
  it("should match scores correctly at session level", async () => {
    const session1 = v4();
    const session2 = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test20-sessionLevel1-${v4()}`;
    const scoreName2 = `test20-sessionLevel2-${v4()}`;

    const scores = [
      // session1 has both scores
      server.createSessionScore({
        project_id: projectId,
        session_id: session1,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: now.getTime(),
      }),
      server.createSessionScore({
        project_id: projectId,
        session_id: session1,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: now.getTime(),
      }),
      // session2 has only one score
      server.createSessionScore({
        project_id: projectId,
        session_id: session2,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3,
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

    // Only session1 should match
    expect(result.counts.matchedCount).toBe(1);
  });

  // Test 22: Handles out-of-order timestamps
  it("should handle scores created in random order", async () => {
    const traces = [v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 7200000); // 2 hours ago
    const toTimestamp = new Date(now.getTime() + 3600000); // 1 hour from now

    const scoreName1 = `test22-order1-${v4()}`;
    const scoreName2 = `test22-order2-${v4()}`;

    // Create scores with out-of-order timestamps
    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[0],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1,
        timestamp: now.getTime() - 3600000, // 1 hour ago
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[1],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 2,
        timestamp: now.getTime(), // now
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3,
        timestamp: now.getTime() - 1800000, // 30 min ago
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[0],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 10,
        timestamp: now.getTime() - 3600000,
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[1],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 20,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[2],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 30,
        timestamp: now.getTime() - 1800000,
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

    // All 3 pairs should match despite out-of-order insertion
    expect(result.counts.matchedCount).toBe(3);
  });

  // Test 23: Verify 7-day intervals align to Monday (ISO 8601 week)
  it("should align 7-day intervals to Monday (ISO 8601 week)", async () => {
    // Test that 7-day intervals use Monday-aligned weeks, not Thursday-aligned epochs
    const traces = [v4(), v4(), v4()];

    // Use a known Monday and Thursday
    // Nov 3, 2025 is a Monday
    // Oct 30, 2025 is a Thursday (would be start of epoch-aligned week)
    const monday = new Date("2025-11-03T10:00:00.000Z"); // Monday
    const thursday = new Date("2025-10-30T10:00:00.000Z"); // Previous Thursday

    const scoreName1 = `test23-score1-${v4()}`;
    const scoreName2 = `test23-score2-${v4()}`;

    // Create scores on Monday
    const scores = [
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[0],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1.0,
        timestamp: monday.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[0],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2.0,
        timestamp: monday.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    // Query with 7-day interval starting from Thursday (90 days back)
    const fromTimestamp = new Date(
      thursday.getTime() - 90 * 24 * 60 * 60 * 1000,
    );
    const toTimestamp = new Date(monday.getTime() + 24 * 60 * 60 * 1000); // Day after Monday

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 7, unit: "day" },
      nBins: 10,
    });

    // The Monday data should appear in a bucket with timestamp = Monday
    // (If using epoch alignment, it would appear in Thursday bucket)
    const mondayBuckets = result.timeSeries.filter((ts) => {
      const tsDate = new Date(ts.timestamp);
      return tsDate.getUTCDay() === 1; // Monday = 1
    });

    // Should have at least one Monday bucket with data
    expect(mondayBuckets.length).toBeGreaterThan(0);

    // The Monday bucket should contain our data
    const mondayBucketWithData = mondayBuckets.find(
      (ts) => ts.avg1 !== null && ts.avg2 !== null,
    );
    expect(mondayBucketWithData).toBeDefined();
    expect(mondayBucketWithData?.avg1).toBe(1.0);
    expect(mondayBucketWithData?.avg2).toBe(2.0);
  });

  // Test 24: Verify 1-day intervals align to calendar day boundaries
  it("should align 1-day intervals to calendar day boundaries (midnight)", async () => {
    // Create scores at different times within the same calendar day on different traces
    const day = new Date("2025-11-03T00:00:00.000Z"); // Midnight
    const morning = new Date("2025-11-03T09:00:00.000Z");
    const evening = new Date("2025-11-03T22:45:00.000Z");

    const scoreName1 = `test24-score1-${v4()}`;
    const scoreName2 = `test24-score2-${v4()}`;

    // Create two traces - one for morning, one for evening
    const trace1 = v4();
    const trace2 = v4();

    const scores = [
      // Morning scores on trace1
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1.0,
        timestamp: morning.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2.0,
        timestamp: morning.getTime(),
      }),
      // Evening scores on trace2
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3.0,
        timestamp: evening.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 4.0,
        timestamp: evening.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const fromTimestamp = new Date(day.getTime() - 24 * 60 * 60 * 1000); // Day before
    const toTimestamp = new Date(day.getTime() + 2 * 24 * 60 * 60 * 1000); // Day after

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "day" },
      nBins: 10,
    });

    // All scores from the same calendar day should be in ONE bucket
    // The bucket timestamp should be midnight (start of day)
    const dayBucket = result.timeSeries.find((ts) => {
      const tsDate = new Date(ts.timestamp);
      return (
        tsDate.getUTCFullYear() === 2025 &&
        tsDate.getUTCMonth() === 10 && // November = 10
        tsDate.getUTCDate() === 3 &&
        tsDate.getUTCHours() === 0 &&
        tsDate.getUTCMinutes() === 0 &&
        tsDate.getUTCSeconds() === 0
      );
    });

    expect(dayBucket).toBeDefined();
    // Average of [1.0, 3.0] = 2.0
    expect(dayBucket?.avg1).toBe(2.0);
    // Average of [2.0, 4.0] = 3.0
    expect(dayBucket?.avg2).toBe(3.0);
  });

  // Test 25: Verify 1-month intervals align to calendar month boundaries
  it("should align 1-month intervals to calendar month boundaries (1st of month)", async () => {
    // Create scores at different times within November 2025 on different traces
    const startOfMonth = new Date("2025-11-01T00:00:00.000Z");
    const midMonth = new Date("2025-11-15T12:00:00.000Z");
    const endOfMonth = new Date("2025-11-30T23:59:59.000Z");

    const scoreName1 = `test25-score1-${v4()}`;
    const scoreName2 = `test25-score2-${v4()}`;

    // Create three traces - one for start, mid, and end of month
    const trace1 = v4();
    const trace2 = v4();
    const trace3 = v4();

    const scores = [
      // Start of month on trace1
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1.0,
        timestamp: startOfMonth.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace1,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2.0,
        timestamp: startOfMonth.getTime(),
      }),
      // Mid month on trace2
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3.0,
        timestamp: midMonth.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace2,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 4.0,
        timestamp: midMonth.getTime(),
      }),
      // End of month on trace3
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace3,
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 5.0,
        timestamp: endOfMonth.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: trace3,
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 6.0,
        timestamp: endOfMonth.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const fromTimestamp = new Date("2025-10-01T00:00:00.000Z"); // Oct 1
    const toTimestamp = new Date("2025-12-01T00:00:00.000Z"); // Dec 1

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "month" },
      nBins: 10,
    });

    // All scores from November should be in ONE bucket
    // The bucket timestamp should be Nov 1st midnight
    const novemberBucket = result.timeSeries.find((ts) => {
      const tsDate = new Date(ts.timestamp);
      return (
        tsDate.getUTCFullYear() === 2025 &&
        tsDate.getUTCMonth() === 10 && // November = 10
        tsDate.getUTCDate() === 1 &&
        tsDate.getUTCHours() === 0 &&
        tsDate.getUTCMinutes() === 0 &&
        tsDate.getUTCSeconds() === 0
      );
    });

    expect(novemberBucket).toBeDefined();
    // Average of [1.0, 3.0, 5.0] = 3.0
    expect(novemberBucket?.avg1).toBe(3.0);
    // Average of [2.0, 4.0, 6.0] = 4.0
    expect(novemberBucket?.avg2).toBe(4.0);
  });

  // Test 26: Matched Distributions - Basic Functionality
  it("should return matched distributions excluding unmatched scores", async () => {
    const traces = [v4(), v4(), v4(), v4(), v4()];

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `test26-matched1-${v4()}`;
    const scoreName2 = `test26-matched2-${v4()}`;

    // Create matched pairs on first 3 traces and unmatched on last 2
    const scores = [
      // Matched pairs
      ...traces.slice(0, 3).flatMap((traceId, idx) => [
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 20,
          timestamp: now.getTime(),
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 20 + idx * 20,
          timestamp: now.getTime(),
        }),
      ]),
      // Unmatched score1 on trace 4
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[3],
        observation_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 70,
        timestamp: now.getTime(),
      }),
      // Unmatched score2 on trace 5
      server.createTraceScore({
        project_id: projectId,
        trace_id: traces[4],
        observation_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 80,
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

    // Matched distributions should only include the 3 matched pairs
    const matchedCount1 = result.distribution1Matched.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const matchedCount2 = result.distribution2Matched.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(matchedCount1).toBe(3);
    expect(matchedCount2).toBe(3);

    // Regular distributions should include all scores (3 matched + 1 unmatched each)
    const totalCount1 = result.distribution1.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const totalCount2 = result.distribution2.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );

    expect(totalCount1).toBe(4);
    expect(totalCount2).toBe(4);

    // Verify counts match
    expect(result.counts.matchedCount).toBe(3);
    expect(result.counts.score1Total).toBe(4);
    expect(result.counts.score2Total).toBe(4);
  });
});
