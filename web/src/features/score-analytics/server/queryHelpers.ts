/**
 * Shared ClickHouse query building utilities for score analytics
 *
 * These helpers are used by both buildEstimateQuery and buildScoreComparisonQuery
 * to construct SQL fragments for filtering and sampling.
 */

/**
 * Build object type filter for score queries
 *
 * Generates SQL WHERE clause fragment to filter scores by attachment type.
 * Ensures exclusive filtering (exactly one non-NULL ID) for trace, observation,
 * session, and dataset_run types.
 *
 * @param objectType - The object type to filter by
 * @returns SQL WHERE clause fragment for object type filtering
 *
 * @example
 * ```typescript
 * buildObjectTypeFilter("trace")
 * // Returns: "AND trace_id IS NOT NULL AND observation_id IS NULL AND session_id IS NULL AND dataset_run_id IS NULL"
 *
 * buildObjectTypeFilter("all")
 * // Returns: ""
 * ```
 */
export function buildObjectTypeFilter(objectType: string): string {
  if (objectType === "all") return "";
  if (objectType === "trace")
    return "AND trace_id IS NOT NULL AND observation_id IS NULL AND session_id IS NULL AND dataset_run_id IS NULL";
  if (objectType === "observation") return "AND observation_id IS NOT NULL";
  if (objectType === "session")
    return "AND session_id IS NOT NULL AND observation_id IS NULL AND trace_id IS NULL AND dataset_run_id IS NULL";
  if (objectType === "dataset_run")
    return "AND dataset_run_id IS NOT NULL AND trace_id IS NULL AND observation_id IS NULL AND session_id IS NULL";
  return "";
}

/**
 * Build sampling expression for hash-based sampling
 *
 * Uses cityHash64 on composite key (trace_id, observation_id, session_id, dataset_run_id)
 * to ensure deterministic pseudo-random sampling that preserves matched pairs across
 * score1 and score2 queries.
 *
 * The cityHash64 function provides uniform distribution, and modulo operation ensures
 * consistent sampling across different score tables.
 *
 * @param samplingPercent - Percentage to sample (0-100)
 * @returns SQL expression for hash-based sampling
 *
 * @example
 * ```typescript
 * buildSamplingExpression(10)
 * // Returns: "cityHash64(...) % 100 < 10"
 *
 * buildSamplingExpression(100)
 * // Returns: "cityHash64(...) % 100 < 100" (no sampling, all data)
 * ```
 */
export function buildSamplingExpression(samplingPercent: number): string {
  return `cityHash64(
    coalesce(trace_id, ''),
    coalesce(observation_id, ''),
    coalesce(session_id, ''),
    coalesce(dataset_run_id, '')
  ) % 100 < ${samplingPercent}`;
}
