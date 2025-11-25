import { z } from "zod/v4";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  getScoresGroupedByNameSourceType,
  queryClickhouse,
  convertDateToClickhouseDateTime,
} from "@langfuse/shared/src/server";
import { buildEstimateQuery } from "./buildEstimateQuery";
import { buildScoreComparisonQuery } from "./buildScoreComparisonQuery";

/**
 * Adaptive FINAL threshold
 * - Use FINAL for datasets < 100k to ensure accuracy
 * - Skip FINAL for datasets >= 100k to improve query performance
 */
const ADAPTIVE_FINAL_THRESHOLD = 100_000;

/**
 * Hash-based sampling thresholds
 * - SAMPLING_THRESHOLD: Sample when either score table exceeds this count
 * - TARGET_SAMPLE_SIZE: Target number of rows to sample from each table
 */
const SAMPLING_THRESHOLD = 100_000; // Start sampling if either table > 100k
const TARGET_SAMPLE_SIZE = 100_000; // Aim for 100k samples from each table

export const scoreAnalyticsRouter = createTRPCRouter({
  /**
   * Get available score identifiers for analytics dropdown
   */
  getScoreIdentifiers: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { projectId } = input;

      // Query ClickHouse for distinct score names, data types, and sources
      const groupedScores = await getScoresGroupedByNameSourceType({
        projectId,
        filter: [],
      });

      // Format for ScoreSelector component: "name-dataType-source"
      const scores = groupedScores.map(({ name, source, dataType }) => ({
        value: `${name}-${dataType}-${source}`,
        name,
        dataType,
        source,
      }));

      return { scores };
    }),

  /**
   * Estimate score comparison size for UI loading indicators
   * Returns quick estimates without running full analytics query
   */
  estimateScoreComparisonSize: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        score1: z.object({
          name: z.string(),
          dataType: z.string(),
          source: z.string(),
        }),
        score2: z.object({
          name: z.string(),
          dataType: z.string(),
          source: z.string(),
        }),
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        objectType: z
          .enum(["all", "trace", "session", "observation", "dataset_run"])
          .default("all"),
        mode: z.enum(["single", "two"]).optional(), // Frontend passes "single" when only score1 selected
      }),
    )
    .query(async ({ input }) => {
      const {
        projectId,
        score1,
        score2,
        fromTimestamp,
        toTimestamp,
        objectType,
      } = input;

      // Run preflight estimate (uses 1% sampling)
      const estimates = await buildEstimateQuery({
        projectId,
        score1Name: score1.name,
        score1Source: score1.source,
        score1DataType: score1.dataType,
        score2Name: score2.name,
        score2Source: score2.source,
        score2DataType: score2.dataType,
        fromTimestamp,
        toTimestamp,
        objectType,
      });

      // Determine if sampling and FINAL will be used
      const willSample =
        estimates.score1Count > SAMPLING_THRESHOLD ||
        estimates.score2Count > SAMPLING_THRESHOLD;

      const willSkipFinal =
        estimates.score1Count >= ADAPTIVE_FINAL_THRESHOLD ||
        estimates.score2Count >= ADAPTIVE_FINAL_THRESHOLD;

      // Estimate query time based on dataset size
      const estimatedQueryTime =
        estimates.estimatedMatchedCount > 1_000_000
          ? "30-60s"
          : estimates.estimatedMatchedCount > 500_000
            ? "15-30s"
            : estimates.estimatedMatchedCount > 100_000
              ? "10-20s"
              : "<10s";

      return {
        score1Count: estimates.score1Count,
        score2Count: estimates.score2Count,
        estimatedMatchedCount: estimates.estimatedMatchedCount,
        willSample,
        willSkipFinal,
        estimatedQueryTime,
        mode: input.mode ?? "two", // Echo back the mode from frontend
      };
    }),
  /**
   * Get comprehensive score comparison analytics using single UNION ALL query
   * Returns counts, heatmap, confusion matrix, statistics, time series, and distributions
   */
  getScoreComparisonAnalytics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        score1: z.object({
          name: z.string(),
          dataType: z.string(),
          source: z.string(),
        }),
        score2: z.object({
          name: z.string(),
          dataType: z.string(),
          source: z.string(),
        }),
        mode: z.enum(["single", "two"]).optional(), // Frontend passes "single" when only score1 selected
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        interval: z
          .object({
            count: z.number().int().positive(),
            unit: z.enum(["second", "minute", "hour", "day", "month", "year"]),
          })
          .refine(
            (val) => {
              // Validate against allowed intervals
              const allowed = [
                // Seconds
                { count: 1, unit: "second" },
                { count: 5, unit: "second" },
                { count: 10, unit: "second" },
                { count: 30, unit: "second" },
                // Minutes
                { count: 1, unit: "minute" },
                { count: 5, unit: "minute" },
                { count: 10, unit: "minute" },
                { count: 30, unit: "minute" },
                // Hours
                { count: 1, unit: "hour" },
                { count: 3, unit: "hour" },
                { count: 6, unit: "hour" },
                { count: 12, unit: "hour" },
                // Days
                { count: 1, unit: "day" },
                { count: 2, unit: "day" },
                { count: 5, unit: "day" },
                { count: 7, unit: "day" },
                { count: 14, unit: "day" },
                // Months
                { count: 1, unit: "month" },
                { count: 3, unit: "month" },
                { count: 6, unit: "month" },
                // Years
                { count: 1, unit: "year" },
              ];
              return allowed.some(
                (a) => a.count === val.count && a.unit === val.unit,
              );
            },
            {
              message:
                "Invalid interval. Must be one of the allowed interval combinations.",
            },
          )
          .default({ count: 1, unit: "day" }),
        nBins: z.number().int().min(5).max(50).default(10),
        objectType: z
          .enum(["all", "trace", "session", "observation", "dataset_run"])
          .default("all"),
        // Optional: Pass estimate results from client to avoid duplicate preflight query
        estimateResults: z
          .object({
            score1Count: z.number(),
            score2Count: z.number(),
            estimatedMatchedCount: z.number(),
          })
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      const {
        projectId,
        score1,
        score2,
        fromTimestamp,
        toTimestamp,
        interval,
        nBins,
        objectType,
      } = input;

      // Note: The backend always returns both matched and unmatched datasets,
      // as well as individual-bound distributions. The frontend chooses which
      // to display based on the selected tab.

      // Detect if comparing identical scores (same name, source, and dataType)
      // When true, certain statistical calculations (like Spearman correlation)
      // will be skipped since they're undefined for identical datasets
      const isIdenticalScores =
        score1.name === score2.name &&
        score1.source === score2.source &&
        score1.dataType === score2.dataType;

      // Use estimate results passed from client if available, otherwise run preflight query
      // This avoids duplicate estimate queries when client already called estimateScoreComparisonSize
      const estimates =
        input.estimateResults ??
        (await buildEstimateQuery({
          projectId,
          score1Name: score1.name,
          score1Source: score1.source,
          score1DataType: score1.dataType,
          score2Name: score2.name,
          score2Source: score2.source,
          score2DataType: score2.dataType,
          fromTimestamp,
          toTimestamp,
          objectType,
        }));

      // Adaptive FINAL logic: Only use FINAL for small datasets to avoid expensive merge
      // For large datasets, skip FINAL to improve performance (scores can be updated, so accuracy matters for recent data)
      const shouldUseFinal =
        estimates.score1Count < ADAPTIVE_FINAL_THRESHOLD &&
        estimates.score2Count < ADAPTIVE_FINAL_THRESHOLD;

      // Hash-based sampling decision: Sample when either score table exceeds threshold
      const shouldSample =
        estimates.score1Count > SAMPLING_THRESHOLD ||
        estimates.score2Count > SAMPLING_THRESHOLD;

      // Calculate rate based on larger table to ensure both tables sample to ~100k rows
      const maxCount = Math.max(estimates.score1Count, estimates.score2Count);
      const samplingRate = shouldSample
        ? Math.min(1.0, TARGET_SAMPLE_SIZE / maxCount)
        : 1.0;
      const samplingPercent = Math.round(samplingRate * 100); // Convert to 0-100 for modulo

      // Sampling expression using cityHash64 on composite key (trace_id, observation_id, session_id, dataset_run_id)
      // This ensures deterministic pseudo-random sampling that preserves matched pairs
      const samplingExpression = shouldSample
        ? `cityHash64(
            coalesce(trace_id, ''),
            coalesce(observation_id, ''),
            coalesce(session_id, ''),
            coalesce(dataset_run_id, '')
          ) % 100 < ${samplingPercent}`
        : null;

      // Determine if this is a single-score or two-score query
      const isSingleScore =
        score1.name === score2.name && score1.source === score2.source;

      // Determine if we're dealing with numeric or categorical/boolean data
      // Cross-type comparisons: treat as categorical if either score is non-numeric
      const isCrossType =
        score1.dataType !== score2.dataType &&
        (score1.dataType !== "NUMERIC" || score2.dataType !== "NUMERIC");

      const isNumeric =
        score1.dataType === "NUMERIC" && score2.dataType === "NUMERIC";
      const isCategoricalComparison =
        !isNumeric && // Any non-numeric comparison
        (score1.dataType === "CATEGORICAL" ||
          score2.dataType === "CATEGORICAL" ||
          isCrossType);

      // Build comprehensive analytics query
      const query = buildScoreComparisonQuery({
        projectId,
        score1,
        score2,
        fromTimestamp,
        toTimestamp,
        interval,
        nBins,
        objectType,
        shouldUseFinal,
        shouldSample,
        samplingPercent,
        isIdenticalScores,
        isSingleScore,
        isNumeric,
        isCategoricalComparison,
      });

      // Execute query
      const results = await queryClickhouse<{
        result_type: string;
        col1: number | null;
        col2: number | null;
        col3: number | null;
        col4: number | null;
        col5: number | null;
        col6: number | null;
        col7: number | null;
        col8: number | null;
        col9: string | null;
        col10: string | null;
        col11: number | null;
        col12: number | null;
      }>({
        query,
        params: {
          projectId,
          score1Name: score1.name,
          score1Source: score1.source,
          score2Name: score2.name,
          score2Source: score2.source,
          dataType1: score1.dataType,
          dataType2: score2.dataType,
          fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
          nBins,
        },
        tags: {
          feature: "scores",
          type: "analytics",
          kind: "comparison",
          projectId,
        },
        clickhouseSettings: {
          // Enable short-circuit evaluation to prevent correlation errors
          // This ensures if() conditions are evaluated before function calls
          short_circuit_function_evaluation: "enable",
        },
      });

      // Parse results by result_type
      const countsRow = results.find((r) => r.result_type === "counts");
      const heatmapRows = results.filter((r) => r.result_type === "heatmap");
      const confusionRows = results.filter(
        (r) => r.result_type === "confusion",
      );
      const statsRow = results.find((r) => r.result_type === "stats");
      const timeseriesRows = results.filter(
        (r) => r.result_type === "timeseries",
      );
      const dist1Rows = results.filter(
        (r) => r.result_type === "distribution1",
      );
      const dist2Rows = results.filter(
        (r) => r.result_type === "distribution2",
      );
      const stackedRows = results.filter((r) => r.result_type === "stacked");
      const stackedMatchedRows = results.filter(
        (r) => r.result_type === "stacked_matched",
      );
      const score2CategoriesRows = results.filter(
        (r) => r.result_type === "score2_categories",
      );
      const dist1MatchedRows = results.filter(
        (r) => r.result_type === "distribution1_matched",
      );
      const dist2MatchedRows = results.filter(
        (r) => r.result_type === "distribution2_matched",
      );
      const dist1IndividualRows = results.filter(
        (r) => r.result_type === "distribution1_individual",
      );
      const dist2IndividualRows = results.filter(
        (r) => r.result_type === "distribution2_individual",
      );
      const timeseriesMatchedRows = results.filter(
        (r) => r.result_type === "timeseries_matched",
      );
      const timeseriesCategorical1Rows = results.filter(
        (r) => r.result_type === "timeseries_categorical1",
      );
      const timeseriesCategorical2Rows = results.filter(
        (r) => r.result_type === "timeseries_categorical2",
      );
      const timeseriesCategorical1MatchedRows = results.filter(
        (r) => r.result_type === "timeseries_categorical1_matched",
      );
      const timeseriesCategorical2MatchedRows = results.filter(
        (r) => r.result_type === "timeseries_categorical2_matched",
      );

      // Build structured response
      return {
        counts: {
          score1Total: countsRow?.col1 ?? 0,
          score2Total: countsRow?.col2 ?? 0,
          matchedCount: countsRow?.col3 ?? 0,
        },
        heatmap: heatmapRows.map((row) => ({
          binX: row.col1 ?? 0,
          binY: row.col2 ?? 0,
          count: row.col3 ?? 0,
          min1: row.col4 ?? 0,
          max1: row.col5 ?? 0,
          min2: row.col6 ?? 0,
          max2: row.col7 ?? 0,
          globalMin: row.col11 ?? 0,
          globalMax: row.col12 ?? 0,
        })),
        confusionMatrix: confusionRows.map((row) => ({
          rowCategory: row.col9 ?? "",
          colCategory: row.col10 ?? "",
          count: row.col1 ?? 0,
        })),
        statistics: statsRow
          ? {
              matchedCount: statsRow.col1 ?? 0,
              mean1: statsRow.col2 ?? null,
              mean2: statsRow.col3 ?? null,
              std1: statsRow.col4 ?? null,
              std2: statsRow.col5 ?? null,
              pearsonCorrelation: statsRow.col6 ?? null,
              mae: statsRow.col7 ?? null,
              rmse: statsRow.col8 ?? null,
              spearmanCorrelation: statsRow.col12 ?? null,
            }
          : null,
        timeSeries: timeseriesRows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          avg1: row.col2 ?? null,
          avg2: row.col3 ?? null,
          count: row.col4 ?? 0,
        })),
        distribution1: dist1Rows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        distribution2: dist2Rows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        stackedDistribution: stackedRows.map((row) => ({
          score1Category: row.col9 ?? "",
          score2Stack: row.col10 ?? "",
          count: row.col1 ?? 0,
        })),
        stackedDistributionMatched: stackedMatchedRows.map((row) => ({
          score1Category: row.col9 ?? "",
          score2Stack: row.col10 ?? "",
          count: row.col1 ?? 0,
        })),
        score2Categories: score2CategoriesRows
          .map((row) => row.col9 ?? "")
          .filter((c) => c !== ""),
        // Matched-only datasets for toggle
        timeSeriesMatched: timeseriesMatchedRows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          avg1: row.col2 ?? null,
          avg2: row.col3 ?? null,
          count: row.col4 ?? 0,
        })),
        distribution1Matched: dist1MatchedRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        distribution2Matched: dist2MatchedRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        // Individual-bound distributions for single-score display
        distribution1Individual: dist1IndividualRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        distribution2Individual: dist2IndividualRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        // Categorical/boolean time series (counts per category over time)
        timeSeriesCategorical1: timeseriesCategorical1Rows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          category: row.col9 ?? "",
          count: row.col4 ?? 0,
        })),
        timeSeriesCategorical2: timeseriesCategorical2Rows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          category: row.col9 ?? "",
          count: row.col4 ?? 0,
        })),
        timeSeriesCategorical1Matched: timeseriesCategorical1MatchedRows.map(
          (row) => ({
            timestamp: new Date((row.col1 ?? 0) * 1000),
            category: row.col9 ?? "",
            count: row.col4 ?? 0,
          }),
        ),
        timeSeriesCategorical2Matched: timeseriesCategorical2MatchedRows.map(
          (row) => ({
            timestamp: new Date((row.col1 ?? 0) * 1000),
            category: row.col9 ?? "",
            count: row.col4 ?? 0,
          }),
        ),
        // Sampling metadata for transparency
        samplingMetadata: {
          isSampled: shouldSample,
          samplingMethod: shouldSample ? ("hash" as const) : ("none" as const),
          samplingRate,
          estimatedTotalMatches: estimates.estimatedMatchedCount,
          actualSampleSize: countsRow?.col3 ?? 0,
          samplingExpression,
          // Include preflight estimates for testing and transparency
          preflightEstimates: {
            score1Count: estimates.score1Count,
            score2Count: estimates.score2Count,
            estimatedMatchedCount: estimates.estimatedMatchedCount,
          },
          // Include adaptive FINAL decision for testing and transparency
          adaptiveFinal: {
            usedFinal: shouldUseFinal,
            reason: shouldUseFinal
              ? "Small dataset - using FINAL for accuracy"
              : "Large dataset - skipping FINAL for performance",
          },
        },
        // Metadata about query mode and score comparison
        metadata: {
          mode: input.mode ?? "two", // Echo back the mode from frontend
          isSameScore: isIdenticalScores,
          dataType: score1.dataType,
        },
      };
    }),
});
