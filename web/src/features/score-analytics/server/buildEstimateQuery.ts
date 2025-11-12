import { queryClickhouse } from "@langfuse/shared/src/server";

/**
 * Build object type filter for score queries
 *
 * @param objectType - The object type to filter by
 * @returns SQL WHERE clause fragment for object type filtering
 */
function buildObjectTypeFilter(objectType: string): string {
  if (objectType === "all") return "";
  if (objectType === "trace")
    return "AND trace_id IS NOT NULL AND observation_id IS NULL AND session_id IS NULL AND dataset_run_id IS NULL";
  if (objectType === "session")
    return "AND session_id IS NOT NULL AND observation_id IS NULL AND trace_id IS NULL AND dataset_run_id IS NULL";
  if (objectType === "observation") return "AND observation_id IS NOT NULL";
  if (objectType === "dataset_run") return "AND dataset_run_id IS NOT NULL";
  return "";
}

/**
 * Build sampling expression for hash-based sampling
 *
 * Uses cityHash64 on composite key (trace_id, observation_id, session_id, dataset_run_id)
 * to ensure deterministic pseudo-random sampling that preserves matched pairs.
 *
 * @param samplingPercent - Percentage to sample (0-100)
 * @returns SQL expression for hash-based sampling
 */
function buildSamplingExpression(samplingPercent: number): string {
  return `cityHash64(
    coalesce(trace_id, ''),
    coalesce(observation_id, ''),
    coalesce(session_id, ''),
    coalesce(dataset_run_id, '')
  ) % 100 < ${samplingPercent}`;
}

/**
 * Build and execute estimation query for score comparison
 *
 * Uses 1% hash sample for fast count approximation without FINAL merge overhead.
 * Returns estimates for score1 count, score2 count, and matched count.
 *
 * This preflight query helps determine:
 * - Whether to apply sampling (if counts exceed thresholds)
 * - Whether to use FINAL merge (adaptive for small datasets)
 * - Expected query time for user feedback
 *
 * @param params - Query parameters
 * @returns Estimated counts for score1, score2, and matched scores
 */
export async function buildEstimateQuery(params: {
  projectId: string;
  score1Name: string;
  score1Source: string;
  score1DataType: string;
  score2Name: string;
  score2Source: string;
  score2DataType: string;
  fromTimestamp: Date;
  toTimestamp: Date;
  objectType: string;
}): Promise<{
  score1Count: number;
  score2Count: number;
  estimatedMatchedCount: number;
}> {
  const {
    projectId,
    score1Name,
    score1Source,
    score1DataType,
    score2Name,
    score2Source,
    score2DataType,
    fromTimestamp,
    toTimestamp,
    objectType,
  } = params;

  // Build filter based on object type
  const objectTypeFilter = buildObjectTypeFilter(objectType);

  // Use 1% hash sample for fast count estimation
  const samplingExpression = buildSamplingExpression(1);

  const preflightQuery = `
    WITH
      score1_sample AS (
        SELECT trace_id, observation_id, session_id, dataset_run_id
        FROM scores
        PREWHERE project_id = {projectId: String}
          AND name = {score1Name: String}
        WHERE source = {score1Source: String}
          AND data_type = {score1DataType: String}
          AND timestamp >= {fromTimestamp: DateTime64(3)}
          AND timestamp <= {toTimestamp: DateTime64(3)}
          AND is_deleted = 0
          AND ${samplingExpression}
          ${objectTypeFilter}
      ),
      score2_sample AS (
        SELECT trace_id, observation_id, session_id, dataset_run_id
        FROM scores
        PREWHERE project_id = {projectId: String}
          AND name = {score2Name: String}
        WHERE source = {score2Source: String}
          AND data_type = {score2DataType: String}
          AND timestamp >= {fromTimestamp: DateTime64(3)}
          AND timestamp <= {toTimestamp: DateTime64(3)}
          AND is_deleted = 0
          AND ${samplingExpression}
          ${objectTypeFilter}
      )
    SELECT
      (SELECT count() FROM score1_sample) * 100 as score1_count,
      (SELECT count() FROM score2_sample) * 100 as score2_count,
      (
        SELECT count() * 100
        FROM score1_sample s1
        INNER JOIN score2_sample s2
          ON ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
          AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
          AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
          AND ifNull(s1.dataset_run_id, '') = ifNull(s2.dataset_run_id, '')
      ) as estimated_matched_count
  `;

  const result = await queryClickhouse<{
    score1_count: string;
    score2_count: string;
    estimated_matched_count: string;
  }>({
    query: preflightQuery,
    params: {
      projectId,
      score1Name,
      score1Source,
      score1DataType: score1DataType,
      score2Name,
      score2Source,
      score2DataType: score2DataType,
      fromTimestamp,
      toTimestamp,
    },
  });

  const row = result[0];
  return {
    score1Count: parseInt(row?.score1_count ?? "0", 10),
    score2Count: parseInt(row?.score2_count ?? "0", 10),
    estimatedMatchedCount: parseInt(row?.estimated_matched_count ?? "0", 10),
  };
}
