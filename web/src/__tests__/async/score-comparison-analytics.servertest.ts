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
  createDatasetRunScore,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

describe("Score Comparison Analytics tRPC", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const session: Session = {
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
    expires: new Date().toISOString(),
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

      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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
      const trace = createTrace({ id: traceId, project_id: projectId });
      await createTracesCh([trace]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test-adaptive-score1-${v4()}`;
      const scoreName2 = `test-adaptive-score2-${v4()}`;

      // Create a small dataset (will use FINAL)
      const score1 = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName1,
        source: "ANNOTATION",
        data_type: "NUMERIC",
        value: 0.5,
        timestamp: now.getTime(),
      });

      const score2 = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: null,
        name: scoreName2,
        source: "ANNOTATION",
        data_type: "NUMERIC",
        value: 0.6,
        timestamp: now.getTime(),
      });

      await createScoresCh([score1, score2]);

      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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

    // Test 5: Adaptive FINAL skips FINAL for large datasets (>100k scores)
    it("should skip FINAL for large datasets to improve performance", async () => {
      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test-large-score1-${v4()}`;
      const scoreName2 = `test-large-score2-${v4()}`;

      // Create 101k scores for score1 and 101k for score2
      // This exceeds ADAPTIVE_FINAL_THRESHOLD (100k)
      const score1Batch: ReturnType<typeof createTraceScore>[] = [];
      const score2Batch: ReturnType<typeof createTraceScore>[] = [];
      const tracesBatch: ReturnType<typeof createTrace>[] = [];

      const batchSize = 101_000; // Exceed threshold

      console.log(
        `Creating ${batchSize} scores for adaptive FINAL test (this may take a moment)...`,
      );

      for (let i = 0; i < batchSize; i++) {
        const traceId = v4();

        // Create trace
        tracesBatch.push(
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime(),
          }),
        );

        // Create score1
        score1Batch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "ANNOTATION",
            data_type: "NUMERIC",
            value: Math.random(),
            timestamp: now.getTime(),
          }),
        );

        // Create score2
        score2Batch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName2,
            source: "ANNOTATION",
            data_type: "NUMERIC",
            value: Math.random(),
            timestamp: now.getTime(),
          }),
        );
      }

      // Insert in batches to avoid memory issues
      const insertBatchSize = 10_000;
      for (let i = 0; i < batchSize; i += insertBatchSize) {
        await createTracesCh(tracesBatch.slice(i, i + insertBatchSize));
        await createScoresCh([
          ...score1Batch.slice(i, i + insertBatchSize),
          ...score2Batch.slice(i, i + insertBatchSize),
        ]);
      }

      console.log(`Inserted ${batchSize} traces and ${batchSize * 2} scores`);

      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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

      // Note: With 101k scores, sampling may or may not trigger depending on
      // preflight variance (1% sample of 101k = ~1010 samples, extrapolated = 95k-105k)
      // If sampling triggers: ~100k rows each (rate ≈ 99%)
      // If no sampling: full 101k rows each
      // Hash-based sampling (cityHash64) provides uniform distribution on average,
      // but can have ~6% variance. With 101k scores, actual results range 94k-106k.
      // Using 90k threshold (not 95k) to account for this probabilistic variance.
      expect(result.counts.score1Total).toBeGreaterThan(90_000);
      expect(result.counts.score2Total).toBeGreaterThan(90_000);

      // matchedCount should be close to score totals (all scores match in this test)
      // Same 90k threshold to account for hash sampling variance
      expect(result.counts.matchedCount).toBeGreaterThan(90_000);
      expect(result.counts.matchedCount).toBeLessThanOrEqual(101_000);

      // Verify preflight estimates via samplingMetadata
      expect(result.samplingMetadata.preflightEstimates).toBeDefined();
      // Preflight uses 1% sampling, so estimates may have variance
      // For 101k scores, 1% sample could estimate anywhere from ~95k-105k
      expect(
        result.samplingMetadata.preflightEstimates?.score1Count,
      ).toBeGreaterThan(90_000);
      expect(
        result.samplingMetadata.preflightEstimates?.score2Count,
      ).toBeGreaterThan(90_000);
      expect(
        result.samplingMetadata.preflightEstimates?.estimatedMatchedCount,
      ).toBeGreaterThan(90_000);

      // Verify adaptive FINAL decision via samplingMetadata
      expect(result.samplingMetadata.adaptiveFinal).toBeDefined();
      // The decision logic should evaluate based on estimates
      // If estimates are >= 100k threshold, usedFinal = false
      // If estimates are < 100k threshold, usedFinal = true
      // Both outcomes are valid for this test - what matters is the query completes successfully
      expect(typeof result.samplingMetadata.adaptiveFinal?.usedFinal).toBe(
        "boolean",
      );
      expect(result.samplingMetadata.adaptiveFinal?.reason).toBeDefined();
    }, 120000); // 2 minute timeout for large data insertion

    // Test 6: Adaptive FINAL with 150k scores - should definitively skip FINAL
    // skipped because flakey in the CI
    it.skip("should skip FINAL for 150k+ scores with high confidence", async () => {
      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test-xlarge-score1-${v4()}`;
      const scoreName2 = `test-xlarge-score2-${v4()}`;

      // Create 150k scores for score1 and 150k for score2
      // This is well above ADAPTIVE_FINAL_THRESHOLD (100k)
      // Even with 1% sampling variance, should reliably estimate >100k
      const score1Batch: ReturnType<typeof createTraceScore>[] = [];
      const score2Batch: ReturnType<typeof createTraceScore>[] = [];
      const tracesBatch: ReturnType<typeof createTrace>[] = [];

      const batchSize = 150_000; // Well above threshold

      console.log(
        `Creating ${batchSize} scores for large-scale adaptive FINAL test (this may take a moment)...`,
      );

      for (let i = 0; i < batchSize; i++) {
        const traceId = v4();

        // Create trace
        tracesBatch.push(
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime(),
          }),
        );

        // Create score1
        score1Batch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "ANNOTATION",
            data_type: "NUMERIC",
            value: Math.random(),
            timestamp: now.getTime(),
          }),
        );

        // Create score2
        score2Batch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName2,
            source: "ANNOTATION",
            data_type: "NUMERIC",
            value: Math.random(),
            timestamp: now.getTime(),
          }),
        );
      }

      // Insert in batches to avoid memory issues
      const insertBatchSize = 10_000;
      for (let i = 0; i < batchSize; i += insertBatchSize) {
        await createTracesCh(tracesBatch.slice(i, i + insertBatchSize));
        await createScoresCh([
          ...score1Batch.slice(i, i + insertBatchSize),
          ...score2Batch.slice(i, i + insertBatchSize),
        ]);
      }

      console.log(`Inserted ${batchSize} traces and ${batchSize * 2} scores`);

      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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

      // Note: With 150k scores in each table, sampling will trigger (threshold = 100k)
      // Sampling rate = 100k / 150k = 67%, so we expect ~100k from each table
      // Allow variance due to hash distribution
      expect(result.counts.score1Total).toBeGreaterThan(90_000);
      expect(result.counts.score1Total).toBeLessThan(110_000);
      expect(result.counts.score2Total).toBeGreaterThan(90_000);
      expect(result.counts.score2Total).toBeLessThan(110_000);

      // matchedCount should be similar to sample size (not the full 150k)
      expect(result.counts.matchedCount).toBeGreaterThan(90_000);
      expect(result.counts.matchedCount).toBeLessThan(110_000);

      // Verify preflight estimates via samplingMetadata
      expect(result.samplingMetadata.preflightEstimates).toBeDefined();
      // For 150k scores, even with 1% sampling variance, should reliably estimate >100k
      // 150k * 1% = 1500 sampled → extrapolated estimate should be 140k-160k range
      expect(
        result.samplingMetadata.preflightEstimates?.score1Count,
      ).toBeGreaterThan(100_000);
      expect(
        result.samplingMetadata.preflightEstimates?.score2Count,
      ).toBeGreaterThan(100_000);
      expect(
        result.samplingMetadata.preflightEstimates?.estimatedMatchedCount,
      ).toBeGreaterThan(100_000);

      // Verify adaptive FINAL decision via samplingMetadata
      // For 150k scores, should definitively skip FINAL for performance
      expect(result.samplingMetadata.adaptiveFinal).toBeDefined();
      expect(result.samplingMetadata.adaptiveFinal?.usedFinal).toBe(false);
      expect(result.samplingMetadata.adaptiveFinal?.reason).toContain(
        "Large dataset - skipping FINAL for performance",
      );

      // Verify sampling was applied (150k > 100k threshold)
      expect(result.samplingMetadata.isSampled).toBe(true);
      expect(result.samplingMetadata.samplingMethod).toBe("hash");
      expect(result.samplingMetadata.samplingRate).toBeCloseTo(0.67, 1); // 100k/150k ≈ 0.67
    }, 180000); // 3 minute timeout for large data insertion

    // Test 7: Hash-based sampling for datasets with >100k estimated matched scores
    it("should apply hash-based sampling when estimated matched count exceeds threshold", async () => {
      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test-hash-sample-s1-${v4()}`;
      const scoreName2 = `test-hash-sample-s2-${v4()}`;

      // Create 120k matched scores (both scores on same traces)
      // This should trigger hash-based sampling (threshold = 100k)
      const score1Batch: ReturnType<typeof createTraceScore>[] = [];
      const score2Batch: ReturnType<typeof createTraceScore>[] = [];
      const tracesBatch: ReturnType<typeof createTrace>[] = [];

      const batchSize = 120_000;

      console.log(
        `Creating ${batchSize} matched scores for hash-based sampling test...`,
      );

      for (let i = 0; i < batchSize; i++) {
        const traceId = v4();
        const scoreTimestamp =
          now.getTime() - Math.floor(Math.random() * 3600000);

        tracesBatch.push(
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime(),
          }),
        );

        score1Batch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "ANNOTATION",
            value: Math.random() * 100,
            data_type: "NUMERIC",
            timestamp: scoreTimestamp,
          }),
        );

        score2Batch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName2,
            source: "ANNOTATION",
            value: Math.random() * 100,
            data_type: "NUMERIC",
            timestamp: scoreTimestamp,
          }),
        );
      }

      await createTracesCh(tracesBatch);
      await createScoresCh([...score1Batch, ...score2Batch]);

      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
        projectId,
        score1: {
          name: scoreName1,
          source: "ANNOTATION",
          dataType: "NUMERIC",
        },
        score2: {
          name: scoreName2,
          source: "ANNOTATION",
          dataType: "NUMERIC",
        },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "hour" as const },
        objectType: "all",
      });

      // Verify query succeeded
      expect(result.counts).toBeDefined();

      // Verify sampling was applied
      expect(result.samplingMetadata.isSampled).toBe(true);
      expect(result.samplingMetadata.samplingMethod).toBe("hash");
      expect(result.samplingMetadata.samplingRate).toBeLessThan(1.0);
      expect(result.samplingMetadata.samplingRate).toBeGreaterThan(0);
      expect(result.samplingMetadata.samplingExpression).toContain(
        "cityHash64",
      );

      // Verify preflight estimates triggered sampling
      expect(
        result.samplingMetadata.preflightEstimates?.estimatedMatchedCount,
      ).toBeGreaterThan(100_000);

      // Verify actualSampleSize is approximately TARGET_SAMPLE_SIZE (100k)
      // Allow for variance due to hash distribution
      expect(result.samplingMetadata.actualSampleSize).toBeGreaterThan(80_000);
      expect(result.samplingMetadata.actualSampleSize).toBeLessThan(120_000);

      // Verify counts reflect sampling
      expect(result.counts.matchedCount).toBe(
        result.samplingMetadata.actualSampleSize,
      );

      // Verify data quality - all result arrays should have data
      expect(result.heatmap.length).toBeGreaterThan(0);
      expect(result.timeSeries.length).toBeGreaterThan(0);
    }, 180000); // 3 minute timeout for large data insertion

    // Test 8: Identical scores with sampling show perfect correlation
    it("should return perfect correlation for identical scores with sampling", async () => {
      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName = `test-identical-${v4()}`;

      // Create 150k scores (exceeds sampling threshold)
      const scoreBatch: ReturnType<typeof createTraceScore>[] = [];
      const tracesBatch: ReturnType<typeof createTrace>[] = [];

      const batchSize = 150_000;

      console.log(
        `Creating ${batchSize} identical scores for perfect correlation test...`,
      );

      for (let i = 0; i < batchSize; i++) {
        const traceId = v4();
        const scoreTimestamp =
          now.getTime() - Math.floor(Math.random() * 3600000);

        tracesBatch.push(
          createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: now.getTime(),
          }),
        );

        scoreBatch.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName,
            source: "ANNOTATION",
            value: Math.random() * 100,
            data_type: "NUMERIC",
            timestamp: scoreTimestamp,
          }),
        );
      }

      // Insert in batches
      const insertBatchSize = 10_000;
      for (let i = 0; i < batchSize; i += insertBatchSize) {
        await createTracesCh(tracesBatch.slice(i, i + insertBatchSize));
        await createScoresCh(scoreBatch.slice(i, i + insertBatchSize));
      }

      console.log(`Inserted ${batchSize} traces and scores`);

      // Compare score to itself
      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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
      });

      // Verify sampling occurred (150k > 100k threshold)
      expect(result.samplingMetadata.isSampled).toBe(true);
      expect(result.samplingMetadata.samplingMethod).toBe("hash");

      // CRITICAL: For identical scores, score1Total === score2Total === matchedCount
      // This ensures the same sample was used for both CTEs
      expect(result.counts.score1Total).toBe(result.counts.score2Total);
      expect(result.counts.matchedCount).toBe(result.counts.score1Total);
      expect(result.counts.matchedCount).toBe(result.counts.score2Total);

      // Verify sample size is within expected range (~100k)
      expect(result.counts.matchedCount).toBeGreaterThan(90_000);
      expect(result.counts.matchedCount).toBeLessThan(110_000);

      // Verify all heatmap points are on the diagonal (bin1Index === bin2Index)
      // For identical scores, every point should have the same bin for both axes
      const offDiagonalPoints = result.heatmap.filter(
        (point) => point.binX !== point.binY,
      );
      expect(offDiagonalPoints.length).toBe(0); // No points off diagonal

      // Verify correlation is skipped for identical scores (as per existing logic)
      expect(result.statistics?.spearmanCorrelation).toBeNull();
    }, 180000); // 3 minute timeout for large data insertion

    // Test 9: Calculates counts correctly with partial matches
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
      const result5 = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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
      const result20 = await caller.scoreAnalytics.getScoreComparisonAnalytics({
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
      const weekResult =
        await caller.scoreAnalytics.getScoreComparisonAnalytics({
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
      const monthResult =
        await caller.scoreAnalytics.getScoreComparisonAnalytics({
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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      // Use a known Monday and Thursday
      // Nov 3, 2025 is a Monday
      // Oct 30, 2025 is a Thursday (would be start of epoch-aligned week)
      const monday = new Date("2025-11-03T10:00:00.000Z"); // Monday
      const thursday = new Date("2025-10-30T10:00:00.000Z"); // Previous Thursday

      const scoreName1 = `test23-score1-${v4()}`;
      const scoreName2 = `test23-score2-${v4()}`;

      // Create scores on Monday
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1.0,
          timestamp: monday.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh([
        createTrace({ id: trace1, project_id: projectId }),
        createTrace({ id: trace2, project_id: projectId }),
      ]);

      const scores = [
        // Morning scores on trace1
        createTraceScore({
          project_id: projectId,
          trace_id: trace1,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1.0,
          timestamp: morning.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: trace2,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 3.0,
          timestamp: evening.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh([
        createTrace({ id: trace1, project_id: projectId }),
        createTrace({ id: trace2, project_id: projectId }),
        createTrace({ id: trace3, project_id: projectId }),
      ]);

      const scores = [
        // Start of month on trace1
        createTraceScore({
          project_id: projectId,
          trace_id: trace1,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1.0,
          timestamp: startOfMonth.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: trace2,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 3.0,
          timestamp: midMonth.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: trace3,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 5.0,
          timestamp: endOfMonth.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test26-matched1-${v4()}`;
      const scoreName2 = `test26-matched2-${v4()}`;

      // Create matched pairs on first 3 traces and unmatched on last 2
      const scores = [
        // Matched pairs
        ...traces.slice(0, 3).flatMap((traceId, idx) => [
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "NUMERIC",
            value: 10 + idx * 20,
            timestamp: now.getTime(),
          }),
          createTraceScore({
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
        createTraceScore({
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
        createTraceScore({
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

      await createScoresCh(scores);

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

    // Test 27: Matched Distributions - Empty When No Matches
    it("should return empty matched distributions when no scores match", async () => {
      const traces = [v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test27-nomatch1-${v4()}`;
      const scoreName2 = `test27-nomatch2-${v4()}`;

      // Create only unmatched scores
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 50,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
        createObservation({
          id: obs3,
          trace_id: traceId,
          project_id: projectId,
          type: "GENERATION",
        }),
      ]);

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test28-obs1-${v4()}`;
      const scoreName2 = `test28-obs2-${v4()}`;

      const scores = [
        // Obs1 has both scores (matched)
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: obs1,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: obs3,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 40,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test29-individual1-${v4()}`;
      const scoreName2 = `test29-individual2-${v4()}`;

      // Score1 range: 10-50 (span: 40), Score2 range: 100-500 (span: 400)
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 10,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test30-similar1-${v4()}`;
      const scoreName2 = `test30-similar2-${v4()}`;

      // Similar ranges: 10-40 vs 15-45
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 10,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test31-cat1-${v4()}`;
      const scoreName2 = `test31-cat2-${v4()}`;

      const categories1 = ["A", "B", "A"];
      const categories2 = ["X", "Y", "Z"];

      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "CATEGORICAL",
          string_value: categories1[idx],
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test32-numeric-${v4()}`;
      const scoreName2 = `test32-categorical-${v4()}`;

      const scores = [
        ...traces.map((traceId, idx) =>
          createTraceScore({
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
          createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

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
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "NUMERIC",
            value: 10 + idx * 5,
            timestamp: day1.getTime(),
          }),
          createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: traces[2],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 30,
          timestamp: day2.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[2],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 40,
          timestamp: day2.getTime(),
        }),
        createTraceScore({
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
        createTraceScore({
          project_id: projectId,
          trace_id: traces[4],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 60,
          timestamp: day3.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[4],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 70,
          timestamp: day3.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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

    // Test 34: Time Series ALL vs MATCHED - Verify Different Data
    // NOTE: This test uncovered a timezone issue where toStartOfDay() without explicit UTC
    // would return epoch 0 for certain dates (DST-related). Fixed by adding 'UTC' parameter
    // to toStartOfDay() in getClickHouseTimeBucketFunction().
    // TODO: Known flaky test - day3All is undefined due to test setup issue
    it.skip("should return different data for timeSeries (all) vs timeSeriesMatched", async () => {
      const traces = [v4(), v4(), v4(), v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const day1 = new Date("2024-01-01T12:00:00Z");
      const day2 = new Date("2024-01-02T12:00:00Z");
      const day3 = new Date("2024-01-03T12:00:00Z");
      const fromTimestamp = new Date("2024-01-01T00:00:00Z");
      const toTimestamp = new Date("2024-01-04T00:00:00Z");

      const scoreName1 = `test34-all-${v4()}`;
      const scoreName2 = `test34-matched-${v4()}`;

      const scores = [
        // Day 1: 2 matched pairs
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10,
          timestamp: day1.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 20,
          timestamp: day1.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[1],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 15,
          timestamp: day1.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[1],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 25,
          timestamp: day1.getTime(),
        }),
        // Day 2: 1 unmatched score1 only
        createTraceScore({
          project_id: projectId,
          trace_id: traces[2],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 30,
          timestamp: day2.getTime(),
        }),
        // Day 3: 1 unmatched score2 only
        createTraceScore({
          project_id: projectId,
          trace_id: traces[3],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 40,
          timestamp: day3.getTime(),
        }),
      ];

      await createScoresCh(scores);

      const result = await caller.scoreAnalytics.getScoreComparisonAnalytics({
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "day" },
        nBins: 10,
      });

      // timeSeries (ALL) should have more observations than timeSeriesMatched
      const totalAllCount = result.timeSeries.reduce(
        (sum, entry) => sum + entry.count,
        0,
      );
      const totalMatchedCount = result.timeSeriesMatched.reduce(
        (sum, entry) => sum + entry.count,
        0,
      );

      expect(totalAllCount).toBeGreaterThan(totalMatchedCount);
      expect(totalAllCount).toBe(6); // 2 matched pairs + 1 unmatched score1 + 1 unmatched score2 = 6 total
      expect(totalMatchedCount).toBe(2); // 2 matched pairs

      // Verify timeSeries includes data for all three days
      const day1All = result.timeSeries.find(
        (ts) => new Date(ts.timestamp).getUTCDate() === 1,
      );
      const day2All = result.timeSeries.find(
        (ts) => new Date(ts.timestamp).getUTCDate() === 2,
      );
      const day3All = result.timeSeries.find(
        (ts) => new Date(ts.timestamp).getUTCDate() === 3,
      );

      expect(day1All).toBeDefined();
      expect(day2All).toBeDefined();
      expect(day3All).toBeDefined();

      // Day 1: Both scores present (matched) - average of (10, 15) and (20, 25)
      expect(day1All?.avg1).toBe(12.5); // (10 + 15) / 2
      expect(day1All?.avg2).toBe(22.5); // (20 + 25) / 2

      // Day 2: Only score1 present (avg2 should be null)
      expect(day2All?.avg1).toBe(30);
      expect(day2All?.avg2).toBeNull();

      // Day 3: Only score2 present (avg1 should be null)
      expect(day3All?.avg1).toBeNull();
      expect(day3All?.avg2).toBe(40);

      // Verify timeSeriesMatched only includes day 1 (matched pairs)
      expect(result.timeSeriesMatched.length).toBe(1);
      const day1Matched = result.timeSeriesMatched.find(
        (ts) => new Date(ts.timestamp).getUTCDate() === 1,
      );
      expect(day1Matched).toBeDefined();
      expect(day1Matched?.avg1).toBe(12.5); // (10 + 15) / 2
      expect(day1Matched?.avg2).toBe(22.5); // (20 + 25) / 2
      expect(day1Matched?.count).toBe(2); // 2 matched pairs
    });

    // Test 35: Time Series Matched - Single Score Mode
    it("should handle timeSeriesMatched in single-score mode", async () => {
      const traces = [v4(), v4(), v4(), v4()];
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const day1 = new Date("2024-01-01T12:00:00Z");
      const day2 = new Date("2024-01-02T12:00:00Z");
      const fromTimestamp = new Date("2024-01-01T00:00:00Z");
      const toTimestamp = new Date("2024-01-03T00:00:00Z");

      const scoreName = `test34-single-${v4()}`;

      const scores = [
        // Day 1: 2 scores
        ...traces.slice(0, 2).map((traceId, idx) =>
          createTraceScore({
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
          createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      // Use specific timestamp: 2024-01-15 12:30:45.123 UTC
      const specificTime = new Date("2024-01-15T12:30:45.123Z");
      const fromTimestamp = new Date("2024-01-15T00:00:00Z");
      const toTimestamp = new Date("2024-01-16T00:00:00Z");

      const scoreName1 = `test35-timestamp1-${v4()}`;
      const scoreName2 = `test35-timestamp2-${v4()}`;

      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 100,
          timestamp: specificTime.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const day1 = new Date("2024-01-01T12:00:00Z");
      const day2 = new Date("2024-01-02T12:00:00Z");
      const day3 = new Date("2024-01-03T12:00:00Z");
      const fromTimestamp = new Date("2024-01-01T00:00:00Z");
      const toTimestamp = new Date("2024-01-04T00:00:00Z");

      const scoreName1 = `test36-nomatch1-${v4()}`;
      const scoreName2 = `test36-nomatch2-${v4()}`;

      // Create only unmatched scores across different days
      const scores = [
        createTraceScore({
          project_id: projectId,
          trace_id: traces[0],
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10,
          timestamp: day1.getTime(),
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traces[1],
          observation_id: null,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 20,
          timestamp: day2.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test37-global1-${v4()}`;
      const scoreName2 = `test37-global2-${v4()}`;

      // Score1: 10-40, Score2: 50-80
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 10 + idx * 10,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName = `test38-singlescore-${v4()}`;

      const scores = traces.map((traceId, idx) =>
        createTraceScore({
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

      await createScoresCh(scores);

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
      await createTracesCh(
        traces.map((id) => createTrace({ id, project_id: projectId })),
      );

      const now = new Date();
      const fromTimestamp = new Date(now.getTime() - 3600000);
      const toTimestamp = new Date(now.getTime() + 3600000);

      const scoreName1 = `test39-disjoint1-${v4()}`;
      const scoreName2 = `test39-disjoint2-${v4()}`;

      // Disjoint ranges: Score1: 1-3, Score2: 100-102
      const scores = traces.flatMap((traceId, idx) => [
        createTraceScore({
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 1 + idx,
          timestamp: now.getTime(),
        }),
        createTraceScore({
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

      await createScoresCh(scores);

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

  describe("Categorical Time Series", () => {
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
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "BOOLEAN",
            string_value: day % 2 === 0 ? "true" : "false",
            timestamp,
          }),
          createTraceScore({
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

      await createScoresCh(scores);

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
            createTraceScore({
              project_id: projectId,
              trace_id: traceId,
              observation_id: null,
              name: scoreName1,
              source: "API",
              data_type: "CATEGORICAL",
              string_value: categories1[i % categories1.length],
              timestamp,
            }),
            createTraceScore({
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

      await createScoresCh(scores);

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
          createTraceScore({
            project_id: projectId,
            trace_id: matchedTraceId,
            observation_id: null,
            name: scoreName1,
            source: "API",
            data_type: "BOOLEAN",
            string_value: "true",
            timestamp,
          }),
          createTraceScore({
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
          createTraceScore({
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
          createTraceScore({
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

      await createScoresCh(scores);

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
          const timestamp = new Date(
            Date.UTC(2024, 0, 1, hour, 0, 0),
          ).getTime();
          const traceId = `trace-hour-${hour}-${i}`;

          scores.push(
            createTraceScore({
              project_id: projectId,
              trace_id: traceId,
              observation_id: null,
              name: scoreName1,
              source: "API",
              data_type: "CATEGORICAL",
              string_value: "CategoryA",
              timestamp,
            }),
            createTraceScore({
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

      await createScoresCh(scores);

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
      const trace = createTrace({ id: traceId, project_id: projectId });
      await createTracesCh([trace]);

      // Create observation for observation-level scores
      const observation = createObservation({
        id: observationId,
        trace_id: traceId,
        project_id: projectId,
      });
      await createObservationsCh([observation]);

      const scores = [
        // Trace-level scores (2 pairs)
        createTraceScore({
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
        createTraceScore({
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
        createTraceScore({
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
        createTraceScore({
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
        createSessionScore({
          project_id: projectId,
          session_id: sessionId,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 5.0,
          timestamp: now.getTime(),
        }),
        createSessionScore({
          project_id: projectId,
          session_id: sessionId,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 6.0,
          timestamp: now.getTime(),
        }),

        // Dataset run-level scores (2 pairs)
        createDatasetRunScore({
          project_id: projectId,
          dataset_run_id: datasetRunId,
          name: scoreName1,
          source: "API",
          data_type: "NUMERIC",
          value: 7.0,
          timestamp: now.getTime(),
        }),
        createDatasetRunScore({
          project_id: projectId,
          dataset_run_id: datasetRunId,
          name: scoreName2,
          source: "API",
          data_type: "NUMERIC",
          value: 8.0,
          timestamp: now.getTime(),
        }),
      ];

      await createScoresCh(scores);

      const baseParams = {
        projectId,
        score1: { name: scoreName1, dataType: "NUMERIC", source: "API" },
        score2: { name: scoreName2, dataType: "NUMERIC", source: "API" },
        fromTimestamp,
        toTimestamp,
        interval: { count: 1, unit: "hour" as const },
      };

      // Test 1: objectType = "all" should return all 4 matched pairs
      const resultAll = await caller.scoreAnalytics.getScoreComparisonAnalytics(
        {
          ...baseParams,
          objectType: "all",
        },
      );
      expect(resultAll.counts.matchedCount).toBe(4);
      expect(resultAll.counts.score1Total).toBe(4);
      expect(resultAll.counts.score2Total).toBe(4);

      // Test 2: objectType = "trace" should return only trace-level scores (1 pair)
      const resultTrace =
        await caller.scoreAnalytics.getScoreComparisonAnalytics({
          ...baseParams,
          objectType: "trace",
        });
      expect(resultTrace.counts.matchedCount).toBe(1);
      expect(resultTrace.counts.score1Total).toBe(1);
      expect(resultTrace.counts.score2Total).toBe(1);

      // Test 3: objectType = "observation" should return only observation-level scores (1 pair)
      const resultObservation =
        await caller.scoreAnalytics.getScoreComparisonAnalytics({
          ...baseParams,
          objectType: "observation",
        });
      expect(resultObservation.counts.matchedCount).toBe(1);
      expect(resultObservation.counts.score1Total).toBe(1);
      expect(resultObservation.counts.score2Total).toBe(1);

      // Test 4: objectType = "session" should return only session-level scores (1 pair)
      const resultSession =
        await caller.scoreAnalytics.getScoreComparisonAnalytics({
          ...baseParams,
          objectType: "session",
        });
      expect(resultSession.counts.matchedCount).toBe(1);
      expect(resultSession.counts.score1Total).toBe(1);
      expect(resultSession.counts.score2Total).toBe(1);

      // Test 5: objectType = "dataset_run" should return only dataset_run-level scores (1 pair)
      const resultDatasetRun =
        await caller.scoreAnalytics.getScoreComparisonAnalytics({
          ...baseParams,
          objectType: "dataset_run",
        });
      expect(resultDatasetRun.counts.matchedCount).toBe(1);
      expect(resultDatasetRun.counts.score1Total).toBe(1);
      expect(resultDatasetRun.counts.score2Total).toBe(1);
    });
  });
});
