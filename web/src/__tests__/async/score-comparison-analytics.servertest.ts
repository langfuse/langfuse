/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTraceScore,
  createScoresCh,
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
  createSessionScore,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

describe("Score Comparison Analytics tRPC", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("getScoreComparisonAnalytics", () => {
    // Test 1: Returns all result types with valid data
    it("should return all result types with matching scores", async () => {
      const traceId = v4();
      const trace = createTrace({ id: traceId, project_id: projectId });
      await createTracesCh([trace]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000); // 1 hour ago
      const toTimestamp = new Date(now.getTime() + 3600000); // 1 hour from now

      // Use unique score names for test isolation
      const scoreName1 = `test1-score1-${v4()}`;
      const scoreName2 = `test1-score2-${v4()}`;

      // Create two numeric scores on the same trace
      // IMPORTANT: Must set observation_id to null for trace-level scores
      const score1 = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "ANNOTATION",
        data_type: "NUMERIC",
        value: 0.8,
        timestamp: now.getTime(),
      });

      const score2 = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "ANNOTATION",
        data_type: "NUMERIC",
        value: 0.9,
        timestamp: now.getTime(),
      });

      await createScoresCh([score1, score2]);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      }

      expect(result.timeSeries).toBeDefined();
      expect(Array.isArray(result.timeSeries)).toBe(true);

      expect(result.distribution1).toBeDefined();
      expect(Array.isArray(result.distribution1)).toBe(true);

      expect(result.distribution2).toBeDefined();
      expect(Array.isArray(result.distribution2)).toBe(true);
    });

    // Test 2: Returns empty results when no scores exist
    it("should return empty results when no scores in time range", async () => {
      const fromTimestamp = new Date("2020-01-01");
      const toTimestamp = new Date("2020-01-02");

      const result = await caller.scores.getScoreComparisonAnalytics({
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
    });

    // Test 3: Validates input schema
    it("should reject invalid nBins values", async () => {
      const now = new Date();

      await expect(
        caller.scores.getScoreComparisonAnalytics({
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
        caller.scores.getScoreComparisonAnalytics({
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

    // Test 4: Calculates counts correctly with partial matches
    it("should calculate counts correctly with partial matches", async () => {
      const trace1 = v4();
      const trace2 = v4();
      const trace3 = v4();

      await createTracesCh([
        createTrace({ id: trace1, project_id: projectId }),
        createTrace({ id: trace2, project_id: projectId }),
        createTrace({ id: trace3, project_id: projectId }),
      ]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test4-s1-${v4()}`;
      const scoreName2 = `test4-s2-${v4()}`;

      // Create scores: trace1 has both, trace2 has only score1, trace3 has only score2
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: trace1,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1.0,
          timestamp: now.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: trace1,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 2.0,
          timestamp: now.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: trace2,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 3.0,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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

      await createTracesCh([
        createTrace({ id: trace1, project_id: projectId }),
        createTrace({ id: trace2, project_id: projectId }),
      ]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test5-isolated1-${v4()}`;
      const scoreName2 = `test5-isolated2-${v4()}`;

      // trace1 has only score1, trace2 has only score2
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: trace1,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1.0,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test6-scoreA-${v4()}`;
      const scoreName2 = `test6-scoreB-${v4()}`;

      // Create 4 matched pairs with known values: (0,0), (25,25), (50,50), (100,100)
      const scores = traces.flatMap((traceId, idx) => {
        const value = idx * 25;
        return [
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "NUMERIC",
            value: value,
            timestamp: now.getTime(),
          }),
          createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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

    // Test 7: Respects nBins parameter
    it("should respect different nBins values", async () => {
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test7-binTest1-${v4()}`;
      const scoreName2 = `test7-binTest2-${v4()}`;

      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 50,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      // Test with 5 bins
      const result5 = await caller.scores.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "day" },
        nBins: 5,
      });

      result5.heatmap.forEach((cell) => {
        expect(cell.binX).toBeLessThan(5);
        expect(cell.binY).toBeLessThan(5);
      });

      // Test with 20 bins
      const result20 = await caller.scores.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "day" },
        nBins: 20,
      });

      result20.heatmap.forEach((cell) => {
        expect(cell.binX).toBeLessThan(20);
        expect(cell.binY).toBeLessThan(20);
      });
    });

    // Test 8: Includes min/max ranges for heatmap bins
    it("should include accurate min/max ranges for each heatmap bin", async () => {
      const traces = [v4(), v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test8-rangeA-${v4()}`;
      const scoreName2 = `test8-rangeB-${v4()}`;

      // Create scores with known values: (10,20), (15,25), (18,28)
      const scores = [
        ...traces.map((traceId, idx) =>
          createTraceScore({
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
          createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

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
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "BOOLEAN",
          value: combinations[idx].val1,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

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
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "CATEGORICAL",
          string_value: categories[idx].cat1,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test11-perfect1-${v4()}`;
      const scoreName2 = `test11-perfect2-${v4()}`;

      // Create identical scores
      const scores = traces.flatMap((traceId, idx) => {
        const value = idx * 10;
        return [
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "NUMERIC",
            value: value,
            timestamp: now.getTime(),
          }),
          createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
        expect(result.statistics.mae).toBeCloseTo(0, 2);
        expect(result.statistics.rmse).toBeCloseTo(0, 2);
      }
    });

    // Test 12: Calculates statistics with known correlation
    it("should calculate statistics correctly for known dataset", async () => {
      const traces = [v4(), v4(), v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test12-linear1-${v4()}`;
      const scoreName2 = `test12-linear2-${v4()}`;

      // Create known dataset: (1,2), (2,4), (3,6), (4,8) - perfect linear relationship
      const values = [1, 2, 3, 4];
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: values[idx],
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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

        // MAE for y=2x should be 0
        expect(result.statistics.mae).toBeGreaterThan(0);

        // RMSE should also be > 0
        expect(result.statistics.rmse).toBeGreaterThan(0);
      }
    });

    // Test 13: Aggregates time series by hour
    it("should aggregate time series correctly by hour", async () => {
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

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
        createTraceScore({
          project_id: projectId,
          trace_id: v4(),
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: ts,
        }),
        createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: timestamps[0],
        }),
        createTraceScore({
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

      await createScoresCh([...scores, ...matchedScores]);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const day1 = new Date("2024-01-01T12:00:00Z");
      const day2 = new Date("2024-01-02T12:00:00Z");
      const fromTimestamp = new Date("2024-01-01T00:00:00Z");
      const toTimestamp = new Date("2024-01-04T00:00:00Z");

      const scoreName1 = `test14-daily1-${v4()}`;
      const scoreName2 = `test14-daily2-${v4()}`;

      // Create scores across 3 days
      const scores = [
        ...traces.slice(0, 2).flatMap((traceId) => [
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "NUMERIC",
            value: 1,
            timestamp: day1.getTime(),
          }),
          createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: traces[2],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: day2.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "day" },
        nBins: 10,
      });

      expect(result.timeSeries.length).toBeGreaterThanOrEqual(2);

      // Total count across time series should equal matched count
      const totalTimeSeriesCount = result.timeSeries.reduce(
        (sum, entry) => sum + entry.count,
        0,
      );
      expect(totalTimeSeriesCount).toBe(result.counts.matchedCount);
    });

    // Test 15: Aggregates time series by week and month
    it("should aggregate time series correctly by week and month", async () => {
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const fromTimestamp = new Date("2024-01-01T00:00:00Z");
      const toTimestamp = new Date("2024-03-01T00:00:00Z");

      const scoreName1 = `test15-period1-${v4()}`;
      const scoreName2 = `test15-period2-${v4()}`;

      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: new Date("2024-01-15T12:00:00Z").getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      // Test 7-day interval (week equivalent)
      const weekResult = await caller.scores.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 7, unit: "day" },
        nBins: 10,
      });

      expect(weekResult.timeSeries.length).toBeGreaterThan(0);

      // Test month interval
      const monthResult = await caller.scores.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "month" },
        nBins: 10,
      });

      expect(monthResult.timeSeries.length).toBeGreaterThan(0);
    });

    // Test 16: Calculates distribution1 accurately
    it("should calculate distribution for first score accurately", async () => {
      const traces = [v4(), v4(), v4(), v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test16-dist1-${v4()}`;
      const scoreName2 = `test16-dist2-${v4()}`;

      // Create 5 scores with known values: 0, 25, 50, 75, 100
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: idx * 25,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test17-distA-${v4()}`;
      const scoreName2 = `test17-distB-${v4()}`;

      // Create 5 scores with known values
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 50, // constant
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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

      await createTracesCh([
        createTrace({ id: trace1, project_id: projectId }),
        createTrace({ id: trace2, project_id: projectId }),
      ]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test18-traceLevel1-${v4()}`;
      const scoreName2 = `test18-traceLevel2-${v4()}`;

      const scores = [
        // Trace 1 has both scores
        createTraceScore({
          project_id: projectId,
          trace_id: trace1,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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

      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);
      await createObservationsCh([
        createObservation({
          id: obs1,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
        }),
        createObservation({
          id: obs2,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
        }),
      ]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test19-obsLevel1-${v4()}`;
      const scoreName2 = `test19-obsLevel2-${v4()}`;

      const scores = [
        // obs1 has both scores
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: obs1,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
        createSessionScore({
          project_id: projectId,
          session_id: session1,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: now.getTime(),
        }),
        createSessionScore({
          project_id: projectId,
          session_id: session1,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 2,
          timestamp: now.getTime(),
        }),
        // session2 has only one score
        createSessionScore({
          project_id: projectId,
          session_id: session2,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 3,
          timestamp: now.getTime(),
        }),
      ];

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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

    // Test 21: Enforces max matched scores limit
    it("should enforce maxMatchedScoresLimit", async () => {
      const traces = Array.from({ length: 150 }, () => v4());
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test21-limit1-${v4()}`;
      const scoreName2 = `test21-limit2-${v4()}`;

      // Create 150 matched pairs
      const scores = traces.flatMap((traceId) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: now.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 2,
          timestamp: now.getTime(),
        }),
      ]);

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "day" },
        nBins: 10,
        maxMatchedScoresLimit: 100,
      });

      // Matched count should be limited to 100
      expect(result.counts.matchedCount).toBeLessThanOrEqual(100);
    });

    // Test 22: Handles out-of-order timestamps
    it("should handle scores created in random order", async () => {
      const traces = [v4(), v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 7200000); // 2 hours ago
      const toTimestamp = new Date(now.getTime() + 3600000); // 1 hour from now

      const scoreName1 = `test22-order1-${v4()}`;
      const scoreName2 = `test22-order2-${v4()}`;

      // Create scores with out-of-order timestamps
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1,
          timestamp: now.getTime() - 3600000, // 1 hour ago
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[1],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 2,
          timestamp: now.getTime(), // now
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[2],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 3,
          timestamp: now.getTime() - 1800000, // 30 min ago
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 10,
          timestamp: now.getTime() - 3600000,
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[1],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 20,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

      const result = await caller.scores.getScoreComparisonAnalytics({
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
  });
});
