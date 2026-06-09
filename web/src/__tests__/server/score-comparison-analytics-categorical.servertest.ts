import * as server from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { caller, projectId } from "./score-comparison-analytics.fixtures";

describe("Score Comparison Analytics tRPC > categorical time series", () => {
  it("should return categorical time series for boolean scores", async () => {
    const scoreName1 = `bool-score-1-${v4()}`;
    const scoreName2 = `bool-score-2-${v4()}`;
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-03T00:00:00Z");

    // Create boolean scores across multiple days
    const scores: any[] = [];
    for (let day = 0; day < 3; day++) {
      const timestamp = new Date(
        Date.UTC(2024, 0, 1 + day, 12, 0, 0),
      ).getTime();
      const traceId = `trace-bool-${day}`;

      scores.push(
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "BOOLEAN",
          string_value: day % 2 === 0 ? "true" : "false",
          timestamp,
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "BOOLEAN",
          string_value: day % 2 === 1 ? "true" : "false",
          timestamp,
        }),
      );
    }

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

    // Verify categorical time series data is returned
    expect(result.timeSeriesCategorical1.length).toBeGreaterThan(0);
    expect(result.timeSeriesCategorical2.length).toBeGreaterThan(0);

    // Verify data structure
    const firstEntry1 = result.timeSeriesCategorical1[0];
    if (firstEntry1) {
      expect(firstEntry1.timestamp).toBeInstanceOf(Date);
      expect(typeof firstEntry1.category).toBe("string");
      expect(typeof firstEntry1.count).toBe("number");
      expect(["true", "false"]).toContain(firstEntry1.category.toLowerCase());
    }

    // Verify both true and false categories exist across the data
    const categories1 = new Set(
      result.timeSeriesCategorical1.map((e) => e.category.toLowerCase()),
    );
    const categories2 = new Set(
      result.timeSeriesCategorical2.map((e) => e.category.toLowerCase()),
    );

    expect(categories1.size).toBeGreaterThan(0);
    expect(categories2.size).toBeGreaterThan(0);
  });

  it("should return categorical time series for categorical scores", async () => {
    const scoreName1 = `cat-score-1-${v4()}`;
    const scoreName2 = `cat-score-2-${v4()}`;
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-05T00:00:00Z");

    const categories1 = ["A", "B", "C"];
    const categories2 = ["X", "Y", "Z"];

    const scores: any[] = [];
    for (let day = 0; day < 4; day++) {
      const timestamp = new Date(
        Date.UTC(2024, 0, 1 + day, 12, 0, 0),
      ).getTime();

      for (let i = 0; i < 3; i++) {
        const traceId = `trace-cat-${day}-${i}`;

        scores.push(
          server.createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "CATEGORICAL",
            string_value: categories1[i % categories1.length],
            timestamp,
          }),
          server.createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName2,
            source: "API",
            data_type: "CATEGORICAL",
            string_value: categories2[i % categories2.length],
            timestamp,
          }),
        );
      }
    }

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

    // Verify categorical time series data is returned
    expect(result.timeSeriesCategorical1.length).toBeGreaterThan(0);
    expect(result.timeSeriesCategorical2.length).toBeGreaterThan(0);

    // Verify all categories appear
    const returnedCategories1 = new Set(
      result.timeSeriesCategorical1.map((e) => e.category),
    );
    const returnedCategories2 = new Set(
      result.timeSeriesCategorical2.map((e) => e.category),
    );

    categories1.forEach((cat) => {
      expect(returnedCategories1.has(cat)).toBe(true);
    });
    categories2.forEach((cat) => {
      expect(returnedCategories2.has(cat)).toBe(true);
    });

    // Verify counts are correct (should be 4 days * 1 occurrence per day = 4 for each category)
    const categoryCounts1 = result.timeSeriesCategorical1.reduce(
      (acc, entry) => {
        acc[entry.category] = (acc[entry.category] || 0) + entry.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    Object.values(categoryCounts1).forEach((count) => {
      expect(count).toBe(4); // 4 days
    });
  });

  it("should return matched categorical time series", async () => {
    const scoreName1 = `bool-score-matched-1-${v4()}`;
    const scoreName2 = `bool-score-matched-2-${v4()}`;
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-04T00:00:00Z");

    const scores: any[] = [];

    // Create 2 matched scores and 1 unmatched for each
    for (let day = 0; day < 3; day++) {
      const timestamp = new Date(
        Date.UTC(2024, 0, 1 + day, 12, 0, 0),
      ).getTime();

      // Matched pair
      const matchedTraceId = `trace-matched-${day}`;
      scores.push(
        server.createTraceScore({
          project_id: projectId,
          trace_id: matchedTraceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "BOOLEAN",
          string_value: "true",
          timestamp,
        }),
        server.createTraceScore({
          project_id: projectId,
          trace_id: matchedTraceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "BOOLEAN",
          string_value: "false",
          timestamp,
        }),
      );

      // Unmatched score1
      scores.push(
        server.createTraceScore({
          project_id: projectId,
          trace_id: `trace-unmatched-1-${day}`,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "BOOLEAN",
          string_value: "false",
          timestamp,
        }),
      );

      // Unmatched score2
      scores.push(
        server.createTraceScore({
          project_id: projectId,
          trace_id: `trace-unmatched-2-${day}`,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "BOOLEAN",
          string_value: "true",
          timestamp,
        }),
      );
    }

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

    // Verify matched categorical time series is returned
    expect(result.timeSeriesCategorical1Matched.length).toBeGreaterThan(0);
    expect(result.timeSeriesCategorical2Matched.length).toBeGreaterThan(0);

    // Verify unmatched categorical time series has more data
    expect(result.timeSeriesCategorical1.length).toBeGreaterThan(
      result.timeSeriesCategorical1Matched.length,
    );
    expect(result.timeSeriesCategorical2.length).toBeGreaterThan(
      result.timeSeriesCategorical2Matched.length,
    );

    // Count total entries
    const totalCount1 = result.timeSeriesCategorical1.reduce(
      (sum, e) => sum + e.count,
      0,
    );
    const matchedCount1 = result.timeSeriesCategorical1Matched.reduce(
      (sum, e) => sum + e.count,
      0,
    );
    const totalCount2 = result.timeSeriesCategorical2.reduce(
      (sum, e) => sum + e.count,
      0,
    );
    const matchedCount2 = result.timeSeriesCategorical2Matched.reduce(
      (sum, e) => sum + e.count,
      0,
    );

    // Each score has 3 matched + 3 unmatched = 6 total per score
    expect(totalCount1).toBe(6);
    expect(matchedCount1).toBe(3);
    expect(totalCount2).toBe(6);
    expect(matchedCount2).toBe(3);
  });

  it("should group categorical time series by time intervals", async () => {
    const scoreName1 = `cat-score-intervals-1-${v4()}`;
    const scoreName2 = `cat-score-intervals-2-${v4()}`;
    const fromTimestamp = new Date("2024-01-01T00:00:00Z");
    const toTimestamp = new Date("2024-01-01T03:00:00Z");

    const scores: any[] = [];

    // Create scores across 3 hours, 2 per hour
    for (let hour = 0; hour < 3; hour++) {
      for (let i = 0; i < 2; i++) {
        const timestamp = new Date(Date.UTC(2024, 0, 1, hour, 0, 0)).getTime();
        const traceId = `trace-hour-${hour}-${i}`;

        scores.push(
          server.createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "CATEGORICAL",
            string_value: "CategoryA",
            timestamp,
          }),
          server.createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName2,
            source: "API",
            data_type: "CATEGORICAL",
            string_value: "CategoryB",
            timestamp,
          }),
        );
      }
    }

    await server.createScoresCh(scores);

    const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
      projectId,
      score1: { name: scoreName1, dataType: "CATEGORICAL", source: "API" },
      score2: { name: scoreName2, dataType: "CATEGORICAL", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "hour" },
      nBins: 10,
    });

    // Verify data is bucketed by hour
    const uniqueTimestamps = new Set(
      result.timeSeriesCategorical1.map((e) =>
        e.timestamp.toISOString().substring(0, 13),
      ),
    );

    // Should have 3 unique hour buckets
    expect(uniqueTimestamps.size).toBe(3);

    // Each hour should have count = 2
    result.timeSeriesCategorical1.forEach((entry) => {
      expect(entry.count).toBe(2);
    });
  });

  // Test: ObjectType filtering works correctly for all types
  it("should filter scores correctly by objectType (trace, observation, session, dataset_run)", async () => {
    const traceId = v4();
    const observationId = v4();
    const sessionId = v4();
    const datasetRunId = v4();

    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - 3600000);
    const toTimestamp = new Date(now.getTime() + 3600000);

    const scoreName1 = `objectType-test-score1-${v4()}`;
    const scoreName2 = `objectType-test-score2-${v4()}`;

    // Create trace for trace-level scores

    const scores = [
      // Trace-level scores (2 pairs)
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        session_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 1.0,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        session_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 2.0,
        timestamp: now.getTime(),
      }),

      // Observation-level scores (2 pairs)
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: observationId,
        session_id: null,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 3.0,
        timestamp: now.getTime(),
      }),
      server.createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: observationId,
        session_id: null,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 4.0,
        timestamp: now.getTime(),
      }),

      // Session-level scores (2 pairs)
      server.createSessionScore({
        project_id: projectId,
        session_id: sessionId,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 5.0,
        timestamp: now.getTime(),
      }),
      server.createSessionScore({
        project_id: projectId,
        session_id: sessionId,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 6.0,
        timestamp: now.getTime(),
      }),

      // Dataset run-level scores (2 pairs)
      server.createDatasetRunScore({
        project_id: projectId,
        dataset_run_id: datasetRunId,
        name: scoreName1,
        source: "API",
        data_type: "NUMERIC",
        value: 7.0,
        timestamp: now.getTime(),
      }),
      server.createDatasetRunScore({
        project_id: projectId,
        dataset_run_id: datasetRunId,
        name: scoreName2,
        source: "API",
        data_type: "NUMERIC",
        value: 8.0,
        timestamp: now.getTime(),
      }),
    ];

    await server.createScoresCh(scores);

    const baseParams = {
      projectId,
      score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
      score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
      fromTimestamp,
      toTimestamp,
      interval: { count: 1, unit: "hour" as const },
    };

    const [
      resultAll,
      resultTrace,
      resultObservation,
      resultSession,
      resultDatasetRun,
    ] = await Promise.all([
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        ...baseParams,
        objectType: "all",
      }),
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        ...baseParams,
        objectType: "trace",
      }),
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        ...baseParams,
        objectType: "observation",
      }),
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        ...baseParams,
        objectType: "session",
      }),
      caller.scoreAnalytics.getScoreComparisonAnalytics({
        ...baseParams,
        objectType: "dataset_run",
      }),
    ]);

    expect(resultAll.counts.matchedCount).toBe(4);
    expect(resultAll.counts.score1Total).toBe(4);
    expect(resultAll.counts.score2Total).toBe(4);

    expect(resultTrace.counts.matchedCount).toBe(1);
    expect(resultTrace.counts.score1Total).toBe(1);
    expect(resultTrace.counts.score2Total).toBe(1);

    expect(resultObservation.counts.matchedCount).toBe(1);
    expect(resultObservation.counts.score1Total).toBe(1);
    expect(resultObservation.counts.score2Total).toBe(1);

    expect(resultSession.counts.matchedCount).toBe(1);
    expect(resultSession.counts.score1Total).toBe(1);
    expect(resultSession.counts.score2Total).toBe(1);

    expect(resultDatasetRun.counts.matchedCount).toBe(1);
    expect(resultDatasetRun.counts.score1Total).toBe(1);
    expect(resultDatasetRun.counts.score2Total).toBe(1);
  });
});
