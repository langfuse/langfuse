/**
 * ClickHouse Query Builder for Score Comparison Analytics
 *
 * This module contains the comprehensive query logic for score comparison analytics.
 * The query uses a WITH (CTE) chain to compute multiple analytics in a single query:
 * - Filtering and sampling
 * - Matching scores across attachment points (trace/observation/session/run)
 * - Heatmaps and confusion matrices
 * - Statistical metrics (mean, std, correlations)
 * - Time series aggregations
 * - Distributions (numeric and categorical)
 *
 * PERFORMANCE NOTE:
 * Most of the query is memory-light, but needs to scan lots of data. This is the
 * main driver of runtime. We would expect similar performance, but better separation
 * if each of the CTEs runs separately and scans through the scores on their own.
 * If we proceed with this feature, we may separate the queries for better dev
 * experience and maintainability. That would also allow us to gradually move queries
 * into any centrally developed metric query builder interface.
 *
 * The current CTE-based approach keeps dependencies visible and ensures data flows
 * logically through the query plan. CTEs like `score1_filtered`, `score2_filtered`,
 * and `matched_scores` are referenced by downstream CTEs (bounds, heatmap, stats, etc.),
 * so the entire query must remain cohesive.
 */

import {
  normalizeIntervalForClickHouse,
  getClickHouseTimeBucketFunction,
} from "@/src/features/score-analytics/lib/clickhouse-time-utils";
import { type IntervalConfig } from "@/src/utils/date-range-utils";
import { buildObjectTypeFilter, buildSamplingExpression } from "./queryHelpers";

/**
 * Build comprehensive score comparison analytics query
 *
 * Returns a single UNION ALL query that computes:
 * - Counts (total scores and matched pairs)
 * - Heatmap (for numeric comparisons)
 * - Confusion matrix (for categorical/boolean comparisons)
 * - Statistics (mean, std, correlations, MAE, RMSE)
 * - Time series (aggregated by intervals)
 * - Distributions (numeric bins or categorical counts)
 * - Stacked distributions (for categorical comparisons)
 * - Categorical time series (category counts over time)
 *
 * @param params - Query configuration parameters
 * @returns ClickHouse SQL query string
 */
export function buildScoreComparisonQuery(params: {
  projectId: string;
  score1: { name: string; dataType: string; source: string };
  score2: { name: string; dataType: string; source: string };
  fromTimestamp: Date;
  toTimestamp: Date;
  interval: IntervalConfig;
  nBins: number;
  objectType: string;
  shouldUseFinal: boolean;
  shouldSample: boolean;
  samplingPercent: number;
  isIdenticalScores: boolean;
  isSingleScore: boolean;
  isNumeric: boolean;
  isCategoricalComparison: boolean;
}): string {
  const {
    objectType,
    shouldUseFinal,
    shouldSample,
    samplingPercent,
    isIdenticalScores,
    isSingleScore,
    isNumeric,
    isCategoricalComparison,
  } = params;

  // Normalize the interval for ClickHouse (always single-unit except 7-day weeks)
  const normalizedInterval = normalizeIntervalForClickHouse(params.interval);

  // Build object type filter based on selection
  const objectTypeFilter = buildObjectTypeFilter(objectType);

  // Build sampling expression
  const samplingExpression = shouldSample
    ? buildSamplingExpression(samplingPercent)
    : null;

  // ============================================
  // CONDITIONAL CTE BUILDERS
  // ============================================

  // Build distribution CTEs conditionally based on data type
  const distribution1CTE = isNumeric
    ? `-- CTE 9: Distribution for score1 (numeric, using global bounds)
      distribution1 AS (
        SELECT
          floor((s.value - b.global_min) /
                ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
          count() as count
        FROM score1_filtered s
        CROSS JOIN bounds b
        GROUP BY bin_index
      )`
    : `-- CTE 9: Distribution for score1 (categorical/boolean or cross-type)
      distribution1 AS (
        SELECT
          (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value, toString(value))) - 1) as bin_index,
          count() as count
        FROM score1_filtered
        WHERE string_value IS NOT NULL OR value IS NOT NULL
        GROUP BY COALESCE(string_value, toString(value))
        ORDER BY bin_index
      )`;

  const distribution2CTE = isNumeric
    ? `-- CTE 10: Distribution for score2 (numeric, using global bounds)
      distribution2 AS (
        SELECT
          floor((s.value - b.global_min) /
                ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
          count() as count
        FROM score2_filtered s
        CROSS JOIN bounds b
        GROUP BY bin_index
      )`
    : `-- CTE 10: Distribution for score2 (categorical/boolean or cross-type)
      distribution2 AS (
        SELECT
          (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value, toString(value))) - 1) as bin_index,
          count() as count
        FROM score2_filtered
        WHERE string_value IS NOT NULL OR value IS NOT NULL
        GROUP BY COALESCE(string_value, toString(value))
        ORDER BY bin_index
      )`;

  // Build time series CTE conditionally based on single vs two-score
  const timeseriesCTE = isSingleScore
    ? `-- CTE 8: Time series (single score)
      timeseries AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
          avg(value) as avg1,
          CAST(NULL AS Nullable(Float64)) as avg2,
          count() as count
        FROM score1_filtered
        WHERE value IS NOT NULL
        GROUP BY ts
        ORDER BY ts
      )`
    : `-- CTE 8: Time series (two scores - ALL data, includes unmatched)
      timeseries AS (
        WITH
          score1_time_agg AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
              avg(value) as avg1,
              count() as count1
            FROM score1_filtered
            WHERE value IS NOT NULL
            GROUP BY ts
          ),
          score2_time_agg AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
              avg(value) as avg2,
              count() as count2
            FROM score2_filtered
            WHERE value IS NOT NULL
            GROUP BY ts
          )
        SELECT
          COALESCE(s1.ts, s2.ts) as ts,
          s1.avg1 as avg1,
          s2.avg2 as avg2,
          (COALESCE(s1.count1, 0) + COALESCE(s2.count2, 0)) as count
        FROM score1_time_agg s1
        FULL OUTER JOIN score2_time_agg s2 ON s1.ts = s2.ts
        ORDER BY ts
      )`;

  // Build matched-only CTEs for distributions and single-score time series
  const distribution1MatchedCTE = isNumeric
    ? `-- CTE 11: Distribution for score1 (numeric, matched only)
      distribution1_matched AS (
        SELECT
          floor((m.value1 - b.global_min) /
                ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
          count() as count
        FROM matched_scores m
        CROSS JOIN bounds b
        GROUP BY bin_index
      )`
    : `-- CTE 11: Distribution for score1 (categorical/boolean or cross-type, matched only)
      distribution1_matched AS (
        SELECT
          (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value1, toString(value1))) - 1) as bin_index,
          count() as count
        FROM matched_scores
        WHERE string_value1 IS NOT NULL OR value1 IS NOT NULL
        GROUP BY COALESCE(string_value1, toString(value1))
        ORDER BY bin_index
      )`;

  const distribution2MatchedCTE = isNumeric
    ? `-- CTE 12: Distribution for score2 (numeric, matched only)
      distribution2_matched AS (
        SELECT
          floor((m.value2 - b.global_min) /
                ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
          count() as count
        FROM matched_scores m
        CROSS JOIN bounds b
        GROUP BY bin_index
      )`
    : `-- CTE 12: Distribution for score2 (categorical/boolean or cross-type, matched only)
      distribution2_matched AS (
        SELECT
          (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value2, toString(value2))) - 1) as bin_index,
          count() as count
        FROM matched_scores
        WHERE string_value2 IS NOT NULL OR value2 IS NOT NULL
        GROUP BY COALESCE(string_value2, toString(value2))
        ORDER BY bin_index
      )`;

  // Build individual-bound distributions for single-score display
  const distribution1IndividualCTE = isNumeric
    ? `-- CTE 13: Distribution for score1 (numeric, using individual bounds for single-score view)
      distribution1_individual AS (
        SELECT
          floor((s.value - b.min1) /
                ((b.max1 - b.min1 + 0.0001) / {nBins: UInt8})) as bin_index,
          count() as count
        FROM score1_filtered s
        CROSS JOIN bounds b
        GROUP BY bin_index
      )`
    : `-- CTE 13: Distribution for score1 (categorical/boolean, same as distribution1)
      distribution1_individual AS (
        SELECT bin_index, count
        FROM distribution1
        ORDER BY bin_index
      )`;

  const distribution2IndividualCTE = isNumeric
    ? `-- CTE 14: Distribution for score2 (numeric, using individual bounds for single-score view)
      distribution2_individual AS (
        SELECT
          floor((s.value - b.min2) /
                ((b.max2 - b.min2 + 0.0001) / {nBins: UInt8})) as bin_index,
          count() as count
        FROM score2_filtered s
        CROSS JOIN bounds b
        GROUP BY bin_index
      )`
    : `-- CTE 14: Distribution for score2 (categorical/boolean, same as distribution2)
      distribution2_individual AS (
        SELECT bin_index, count
        FROM distribution2
        ORDER BY bin_index
      )`;

  // Build matched-only time series for single-score mode
  const timeseriesMatchedCTE = isSingleScore
    ? `-- CTE 15: Time series (single score, matched only)
      timeseries_matched AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
          avg(value1) as avg1,
          CAST(NULL AS Nullable(Float64)) as avg2,
          count() as count
        FROM matched_scores
        WHERE value1 IS NOT NULL
        GROUP BY ts
        ORDER BY ts
      )`
    : `-- CTE 15: Time series (two scores, matched only - re-query matched_scores)
      timeseries_matched AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
          avg(value1) as avg1,
          avg(value2) as avg2,
          count() as count
        FROM matched_scores
        GROUP BY ts
        ORDER BY ts
      )`;

  // Build categorical/boolean time series CTEs
  // These show counts per category over time (not averages)
  const timeseriesCategorical1CTE = isSingleScore
    ? `-- CTE 16: Categorical time series for score1 (single score mode)
      timeseries_categorical1 AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
          COALESCE(string_value, toString(value)) as category,
          count() as count
        FROM score1_filtered
        WHERE string_value IS NOT NULL OR value IS NOT NULL
        GROUP BY ts, category
        ORDER BY ts, category
      )`
    : `-- CTE 16: Categorical time series for score1 (two score mode)
      timeseries_categorical1 AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
          COALESCE(string_value, toString(value)) as category,
          count() as count
        FROM score1_filtered
        WHERE string_value IS NOT NULL OR value IS NOT NULL
        GROUP BY ts, category
        ORDER BY ts, category
      )`;

  const timeseriesCategorical2CTE = isSingleScore
    ? `-- CTE 17: Categorical time series for score2 (not needed in single score mode)
      timeseries_categorical2 AS (
        SELECT
          CAST(NULL AS Nullable(DateTime)) as ts,
          CAST(NULL AS Nullable(String)) as category,
          CAST(NULL AS Nullable(UInt64)) as count
        WHERE 1 = 0
      )`
    : `-- CTE 17: Categorical time series for score2 (two score mode)
      timeseries_categorical2 AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
          COALESCE(string_value, toString(value)) as category,
          count() as count
        FROM score2_filtered
        WHERE string_value IS NOT NULL OR value IS NOT NULL
        GROUP BY ts, category
        ORDER BY ts, category
      )`;

  const timeseriesCategorical1MatchedCTE = isSingleScore
    ? `-- CTE 18: Categorical time series for score1 (single score, matched only)
      timeseries_categorical1_matched AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
          COALESCE(string_value1, toString(value1)) as category,
          count() as count
        FROM matched_scores
        WHERE string_value1 IS NOT NULL OR value1 IS NOT NULL
        GROUP BY ts, category
        ORDER BY ts, category
      )`
    : `-- CTE 18: Categorical time series for score1 (two scores, matched only)
      timeseries_categorical1_matched AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
          COALESCE(string_value1, toString(value1)) as category,
          count() as count
        FROM matched_scores
        WHERE string_value1 IS NOT NULL OR value1 IS NOT NULL
        GROUP BY ts, category
        ORDER BY ts, category
      )`;

  const timeseriesCategorical2MatchedCTE = isSingleScore
    ? `-- CTE 19: Categorical time series for score2 (not needed in single score mode)
      timeseries_categorical2_matched AS (
        SELECT
          CAST(NULL AS Nullable(DateTime)) as ts,
          CAST(NULL AS Nullable(String)) as category,
          CAST(NULL AS Nullable(UInt64)) as count
        WHERE 1 = 0
      )`
    : `-- CTE 19: Categorical time series for score2 (two scores, matched only)
      timeseries_categorical2_matched AS (
        SELECT
          ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
          COALESCE(string_value2, toString(value2)) as category,
          count() as count
        FROM matched_scores
        WHERE string_value2 IS NOT NULL OR value2 IS NOT NULL
        GROUP BY ts, category
        ORDER BY ts, category
      )`;

  // ============================================
  // MAIN QUERY CONSTRUCTION
  // ============================================

  return `
    WITH
      -- ============================================
      -- FILTERING CTEs (produce filtered datasets)
      -- ============================================

      -- CTE 1: Filter score 1
      -- PREWHERE optimization: Apply most selective filters (project_id, name) early
      -- to reduce data read from disk before applying other filters
      -- Adaptive FINAL: Only use FINAL for small datasets (<100k) to balance accuracy vs performance
      -- Hash-based sampling: Applied when estimated matched count exceeds threshold
      score1_filtered AS (
        SELECT
          id, value, string_value,
          trace_id, observation_id, session_id, dataset_run_id as run_id,
          timestamp
        FROM scores ${shouldUseFinal ? "FINAL" : ""}
        PREWHERE project_id = {projectId: String}
          AND name = {score1Name: String}
        WHERE source = {score1Source: String}
          AND data_type = {dataType1: String}
          AND timestamp >= {fromTimestamp: DateTime64(3)}
          AND timestamp <= {toTimestamp: DateTime64(3)}
          AND is_deleted = 0
          ${objectTypeFilter}
          ${shouldSample ? `AND ${samplingExpression}` : ""}
      ),

      -- CTE 2: Filter score 2
      -- PREWHERE optimization: Apply most selective filters (project_id, name) early
      -- Adaptive FINAL: Only use FINAL for small datasets (<100k)
      -- Hash-based sampling: Applied when estimated matched count exceeds threshold
      -- Special case: When comparing identical scores, reuse score1_filtered to ensure perfect correlation
      score2_filtered AS (
        ${
          isIdenticalScores
            ? `SELECT * FROM score1_filtered`
            : `SELECT
                 id, value, string_value,
                 trace_id, observation_id, session_id, dataset_run_id as run_id,
                 timestamp
               FROM scores ${shouldUseFinal ? "FINAL" : ""}
               PREWHERE project_id = {projectId: String}
                 AND name = {score2Name: String}
               WHERE source = {score2Source: String}
                 AND data_type = {dataType2: String}
                 AND timestamp >= {fromTimestamp: DateTime64(3)}
                 AND timestamp <= {toTimestamp: DateTime64(3)}
                 AND is_deleted = 0
                 ${objectTypeFilter}
                 ${shouldSample ? `AND ${samplingExpression}` : ""}`
        }
      ),

      -- CTE 3: Match scores - must have exact same attachment (trace/obs/session/run)
      -- NULL-safe comparison: convert NULL to empty string for comparison
      -- Special case: For identical scores, use self-join on ID to ensure perfect pairing
      -- Note: No LIMIT needed - sampling already ensures score1_filtered and score2_filtered are ~100k rows max
      matched_scores AS (
        SELECT
          s1.value as value1,
          s1.string_value as string_value1,
          ${isIdenticalScores ? "s1.value" : "s2.value"} as value2,
          ${isIdenticalScores ? "s1.string_value" : "s2.string_value"} as string_value2,
          s1.timestamp as timestamp1,
          ${isIdenticalScores ? "s1.timestamp" : "s2.timestamp"} as timestamp2,
          ${isIdenticalScores ? "s1.trace_id" : "coalesce(s1.trace_id, s2.trace_id)"} as trace_id,
          ${isIdenticalScores ? "s1.observation_id" : "coalesce(s1.observation_id, s2.observation_id)"} as observation_id,
          ${isIdenticalScores ? "s1.session_id" : "coalesce(s1.session_id, s2.session_id)"} as session_id,
          ${isIdenticalScores ? "s1.run_id" : "coalesce(s1.run_id, s2.run_id)"} as run_id
        FROM score1_filtered s1
        INNER JOIN ${isIdenticalScores ? "score1_filtered" : "score2_filtered"} s2
          ON ${
            isIdenticalScores
              ? "s1.id = s2.id"
              : `ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
          AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
          AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
          AND ifNull(s1.run_id, '') = ifNull(s2.run_id, '')`
          }
        LIMIT 1000000 -- Safety limit to prevent Cartesian product explosions when multiple scores of same name/source exist on one attachment point (trace/observation/session/run)
      ),

      -- CTE 3a: Count all matched score pairs
      -- Counts all rows in matched_scores (not unique attachment points).
      -- NOTE: When multiple scores of same name/source exist on one attachment point,
      -- matched count can exceed both score1Total and score2Total due to Cartesian product.
      -- Example: 2 "gpt4" scores + 3 "gemini" scores on same trace = 6 matched pairs (2 × 3 = 6).
      -- This is correct behavior - each score pair combination is a valid match.
      matched_count AS (
        SELECT count(*) as cnt
        FROM matched_scores
      ),

      -- ============================================
      -- BOUNDS CTEs (calculate ranges for binning)
      -- ============================================

      -- CTE 4: Bounds (for numeric heatmap and distribution binning)
      -- Calculate global bounds across ALL scores (not just matched) for consistent binning
      bounds AS (
        SELECT
          least(
            (SELECT min(value) FROM score1_filtered),
            (SELECT min(value) FROM score2_filtered)
          ) as global_min,
          greatest(
            (SELECT max(value) FROM score1_filtered),
            (SELECT max(value) FROM score2_filtered)
          ) as global_max,
          -- Keep individual bounds for reference (used in response)
          (SELECT min(value) FROM score1_filtered) as min1,
          (SELECT max(value) FROM score1_filtered) as max1,
          (SELECT min(value) FROM score2_filtered) as min2,
          (SELECT max(value) FROM score2_filtered) as max2
      ),

      -- ============================================
      -- ANALYTICS CTEs (use filtered data + bounds)
      -- ============================================

      -- CTE 5: Heatmap (numeric only, NxN grid using independent bounds per score)
      heatmap AS (
        SELECT
          floor((m.value1 - b.min1) / ((b.max1 - b.min1 + 0.0001) / {nBins: UInt8})) as bin_x,
          floor((m.value2 - b.min2) / ((b.max2 - b.min2 + 0.0001) / {nBins: UInt8})) as bin_y,
          count() as count,
          b.global_min, b.global_max,
          b.min1, b.max1, b.min2, b.max2
        FROM matched_scores m
        CROSS JOIN bounds b
        GROUP BY bin_x, bin_y, b.global_min, b.global_max, b.min1, b.max1, b.min2, b.max2
      ),

      -- CTE 6: Confusion matrix (categorical/boolean and cross-type)
      confusion AS (
        SELECT
          COALESCE(string_value1, toString(value1)) as row_category,
          COALESCE(string_value2, toString(value2)) as col_category,
          count() as count
        FROM matched_scores
        GROUP BY row_category, col_category
      ),

      ${
        isCategoricalComparison
          ? `-- CTE 6a: LEFT JOIN score1 with score2 for stacked distribution
      score1_with_score2 AS (
        SELECT
          -- Use string_value for categorical/boolean, convert value to string for numeric
          COALESCE(s1.string_value, toString(s1.value)) as score1_category,
          COALESCE(s2.string_value, toString(s2.value)) as score2_category
        FROM score1_filtered s1
        LEFT JOIN score2_filtered s2
          ON ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
          AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
          AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
          AND ifNull(s1.run_id, '') = ifNull(s2.run_id, '')
        LIMIT 1000000  -- Safety limit for categorical LEFT JOIN (more prone to expansion than INNER JOIN)
      ),

      -- CTE 6b: Stacked distribution (score1 categories with score2 breakdowns)
      stacked_distribution AS (
        SELECT
          score1_category,
          coalesce(score2_category, '__unmatched__') as score2_stack,
          count() as count
        FROM score1_with_score2
        WHERE score1_category IS NOT NULL
        GROUP BY score1_category, score2_stack
        ORDER BY score1_category, score2_stack
      ),

      -- CTE 6c: All score2 categories for legend
      score2_categories AS (
        SELECT DISTINCT COALESCE(string_value, toString(value)) as category
        FROM score2_filtered
        WHERE string_value IS NOT NULL OR value IS NOT NULL
        ORDER BY category
      ),

      -- CTE 6d: Stacked distribution (matched only - no __unmatched__)
      stacked_distribution_matched AS (
        SELECT
          COALESCE(string_value1, toString(value1)) as score1_category,
          COALESCE(string_value2, toString(value2)) as score2_stack,
          count() as count
        FROM matched_scores
        WHERE (string_value1 IS NOT NULL OR value1 IS NOT NULL)
          AND (string_value2 IS NOT NULL OR value2 IS NOT NULL)
        GROUP BY score1_category, score2_stack
        ORDER BY score1_category, score2_stack
      ),`
          : ""
      }

      -- CTE 7: Correlation safety check
      -- Pre-compute whether it's safe to calculate correlations
      -- Requires at least 2 data points and non-zero variance in both samples
      correlation_check AS (
        SELECT
          count() >= 2
            AND stddevPop(value1) > 0
            AND stddevPop(value2) > 0 as is_safe
        FROM matched_scores
      ),

      -- CTE 8: Statistics
      -- IMPORTANT: Calculate mean/std from individual filtered scores, NOT matched_scores
      -- This ensures statistics are available even when matchedCount = 0
      -- Comparison metrics (mae/rmse/correlations) still use matched_scores since they require pairs
      stats AS (
        SELECT
          (SELECT count() FROM matched_scores) as matched_count,
          ${
            isNumeric
              ? `-- Individual score statistics from filtered tables (not matched pairs)
          (SELECT avg(value) FROM score1_filtered) as mean1,
          (SELECT avg(value) FROM score2_filtered) as mean2,
          (SELECT stddevPop(value) FROM score1_filtered) as std1,
          (SELECT stddevPop(value) FROM score2_filtered) as std2,
          -- Comparison metrics require matched pairs
          (SELECT avg(abs(value1 - value2)) FROM matched_scores) as mae,
          (SELECT sqrt(avg(pow(value1 - value2, 2))) FROM matched_scores) as rmse,
          -- Conditional correlation: only execute subquery if safe
          -- Uses short-circuit evaluation to prevent errors with insufficient data
          ${
            isIdenticalScores
              ? "NULL"
              : `if(
            (SELECT is_safe FROM correlation_check),
            (SELECT corr(value1, value2) FROM matched_scores),
            NULL
          )`
          } as pearson_correlation,
          ${
            isIdenticalScores
              ? "NULL"
              : `if(
            (SELECT is_safe FROM correlation_check),
            (SELECT rankCorr(value1, value2) FROM matched_scores),
            NULL
          )`
          } as spearman_correlation`
              : `-- Categorical/boolean scores: statistical metrics are not meaningful
          NULL as mean1,
          NULL as mean2,
          NULL as std1,
          NULL as std2,
          NULL as pearson_correlation,
          NULL as spearman_correlation,
          NULL as mae,
          NULL as rmse`
          }
      ),

      ${timeseriesCTE},

      ${distribution1CTE},

      ${distribution2CTE},

      ${distribution1MatchedCTE},

      ${distribution2MatchedCTE},

      ${distribution1IndividualCTE},

      ${distribution2IndividualCTE},

      ${timeseriesMatchedCTE},

      ${timeseriesCategorical1CTE},

      ${timeseriesCategorical2CTE},

      ${timeseriesCategorical1MatchedCTE},

      ${timeseriesCategorical2MatchedCTE}

    -- ============================================
    -- UNION ALL RESULTS (return multiple result sets)
    -- ============================================
    SELECT
      'counts' as result_type,
      CAST((SELECT count() FROM score1_filtered) AS Float64) as col1,
      CAST((SELECT count() FROM score2_filtered) AS Float64) as col2,
      CAST((SELECT cnt FROM matched_count) AS Float64) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12

    UNION ALL

    SELECT
      'heatmap' as result_type,
      CAST(bin_x AS Float64) as col1,
      CAST(bin_y AS Float64) as col2,
      CAST(count AS Float64) as col3,
      min1 as col4,          -- Individual bounds for score1
      max1 as col5,
      min2 as col6,          -- Individual bounds for score2
      max2 as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      global_min as col11,   -- Global bounds for comparison
      global_max as col12
    FROM heatmap

    UNION ALL

    SELECT
      'confusion' as result_type,
      CAST(count AS Float64) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      row_category as col9,
      col_category as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM confusion

    UNION ALL

    SELECT
      'stats' as result_type,
      CAST(matched_count AS Float64) as col1,
      mean1 as col2,
      mean2 as col3,
      std1 as col4,
      std2 as col5,
      pearson_correlation as col6,
      mae as col7,
      rmse as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      spearman_correlation as col12
    FROM stats

    UNION ALL

    SELECT
      'timeseries' as result_type,
      CAST(toUnixTimestamp(ts) AS Float64) as col1,
      CAST(avg1 AS Nullable(Float64)) as col2,
      CAST(avg2 AS Nullable(Float64)) as col3,
      CAST(count AS Float64) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM timeseries

    UNION ALL

    SELECT
      'distribution1' as result_type,
      CAST(bin_index AS Float64) as col1,
      CAST(count AS Float64) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM distribution1

    UNION ALL

    SELECT
      'distribution2' as result_type,
      CAST(bin_index AS Float64) as col1,
      CAST(count AS Float64) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM distribution2

    ${
      isCategoricalComparison
        ? `
    UNION ALL

    SELECT
      'stacked' as result_type,
      CAST(count AS Float64) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      score1_category as col9,
      score2_stack as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM stacked_distribution

    UNION ALL

    SELECT
      'score2_categories' as result_type,
      CAST(NULL AS Nullable(Float64)) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      category as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM score2_categories

    UNION ALL

    SELECT
      'stacked_matched' as result_type,
      CAST(count AS Float64) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      score1_category as col9,
      score2_stack as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM stacked_distribution_matched`
        : ""
    }

    UNION ALL

    SELECT
      'distribution1_matched' as result_type,
      CAST(bin_index AS Float64) as col1,
      CAST(count AS Float64) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM distribution1_matched

    UNION ALL

    SELECT
      'distribution2_matched' as result_type,
      CAST(bin_index AS Float64) as col1,
      CAST(count AS Float64) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM distribution2_matched

    UNION ALL

    SELECT
      'distribution1_individual' as result_type,
      CAST(bin_index AS Float64) as col1,
      CAST(count AS Float64) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM distribution1_individual

    UNION ALL

    SELECT
      'distribution2_individual' as result_type,
      CAST(bin_index AS Float64) as col1,
      CAST(count AS Float64) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(NULL AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM distribution2_individual

    UNION ALL

    SELECT
      'timeseries_matched' as result_type,
      CAST(toUnixTimestamp(ts) AS Float64) as col1,
      CAST(avg1 AS Nullable(Float64)) as col2,
      CAST(avg2 AS Nullable(Float64)) as col3,
      CAST(count AS Float64) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      CAST(NULL AS Nullable(String)) as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM timeseries_matched

    UNION ALL

    SELECT
      'timeseries_categorical1' as result_type,
      CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(count AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      category as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM timeseries_categorical1

    UNION ALL

    SELECT
      'timeseries_categorical2' as result_type,
      CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(count AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      category as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM timeseries_categorical2

    UNION ALL

    SELECT
      'timeseries_categorical1_matched' as result_type,
      CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(count AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      category as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM timeseries_categorical1_matched

    UNION ALL

    SELECT
      'timeseries_categorical2_matched' as result_type,
      CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
      CAST(NULL AS Nullable(Float64)) as col2,
      CAST(NULL AS Nullable(Float64)) as col3,
      CAST(count AS Nullable(Float64)) as col4,
      CAST(NULL AS Nullable(Float64)) as col5,
      CAST(NULL AS Nullable(Float64)) as col6,
      CAST(NULL AS Nullable(Float64)) as col7,
      CAST(NULL AS Nullable(Float64)) as col8,
      category as col9,
      CAST(NULL AS Nullable(String)) as col10,
      CAST(NULL AS Nullable(Float64)) as col11,
      CAST(NULL AS Nullable(Float64)) as col12
    FROM timeseries_categorical2_matched
  `;
}
