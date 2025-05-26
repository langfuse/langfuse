import type { NextApiRequest, NextApiResponse } from "next";
import { Pool } from "pg";
import { env } from "../../../env"; // Assuming env is set up for Next.js like this
import { logger } from "@langfuse/shared/src/server"; // Assuming logger is available

// --- SQL Query Definitions ---
// These are based on the content of greptimedb_analytics_queries.sql

const QUERY_1_COMPLEX_TRACE = `
WITH TraceObservationAggregates AS (
    SELECT
        trace_id,
        COUNT(id) AS observation_count,
        SUM(total_cost) AS total_observation_cost
    FROM
        observations
    WHERE
        project_id = $1 -- $1: projectId
        AND start_time >= $2 -- $2: fromTimestamp
        AND start_time < $3  -- $3: toTimestamp
    GROUP BY
        trace_id
)
SELECT
    date_trunc('day', t.timestamp) AS trace_day,
    t.name AS trace_name,
    t.user_id AS trace_user_id,
    COUNT(DISTINCT t.id) AS daily_trace_count,
    SUM(toa.observation_count) AS total_observations_for_traces,
    SUM(toa.total_observation_cost) AS total_cost_for_traces
FROM
    traces t
LEFT JOIN
    TraceObservationAggregates toa ON t.id = toa.trace_id
WHERE
    t.project_id = $1 -- $1: projectId
    AND t.timestamp >= $2 -- $2: fromTimestamp
    AND t.timestamp < $3  -- $3: toTimestamp
    AND t.tags LIKE $4 -- $4: tagsFilter (e.g., '%"tag-a"%')
    AND json_extract_path_text(t.metadata, $5) = $6 -- $5: metadataJsonPath (e.g., '$.customer'), $6: metadataValue
GROUP BY
    trace_day,
    t.name,
    t.user_id
ORDER BY
    trace_day,
    trace_name,
    trace_user_id;
`;

const QUERY_2_OBSERVATION_PERFORMANCE = `
SELECT
    date_trunc('hour', start_time) AS hour_bucket,
    name AS observation_name,
    provided_model_name,
    approx_percentile_cont( (CAST(end_time AS BIGINT) - CAST(start_time AS BIGINT)) / 1000.0, 0.95 ) AS p95_latency_seconds,
    approx_percentile_cont( (CAST(completion_start_time AS BIGINT) - CAST(start_time AS BIGINT)) / 1000.0, 0.95 ) AS p95_ttft_seconds,
    AVG(CAST(json_extract_path_text(usage_details, '$.total_tokens') AS FLOAT64)) AS avg_total_tokens
FROM
    observations
WHERE
    project_id = $1 -- $1: projectId
    AND type = 'GENERATION'
    AND start_time >= $2 -- $2: fromTimestamp
    AND start_time < $3  -- $3: toTimestamp
    AND end_time IS NOT NULL
    AND completion_start_time IS NOT NULL
    AND usage_details IS NOT NULL
    AND json_extract_path_text(usage_details, '$.total_tokens') IS NOT NULL
GROUP BY
    hour_bucket,
    name,
    provided_model_name
ORDER BY
    hour_bucket,
    observation_name,
    provided_model_name;
`;

const QUERY_3_SCORE_ANALYSIS_NO_JOIN = `
SELECT
    date_trunc('day', timestamp) AS score_day,
    name AS score_name,
    trace_id,
    AVG(value) AS average_score_value,
    COUNT(id) AS score_count
FROM
    scores
WHERE
    project_id = $1 -- $1: projectId
    AND timestamp >= $2 -- $2: fromTimestamp
    AND timestamp < $3  -- $3: toTimestamp
    AND source = $4 -- $4: source (e.g., 'human')
    AND data_type = 'NUMERIC'
GROUP BY
    score_day,
    name,
    trace_id
ORDER BY
    score_day,
    score_name,
    trace_id;
`;

const QUERY_3_SCORE_ANALYSIS_WITH_JOIN = `
SELECT
    date_trunc('day', s.timestamp) AS score_day,
    s.name AS score_name,
    t.name AS trace_name,
    AVG(s.value) AS average_score_value,
    COUNT(s.id) AS score_count
FROM
    scores s
LEFT JOIN
    traces t ON s.trace_id = t.id AND s.project_id = t.project_id
WHERE
    s.project_id = $1 -- $1: projectId
    AND s.timestamp >= $2 -- $2: fromTimestamp
    AND s.timestamp < $3  -- $3: toTimestamp
    AND s.source = $4 -- $4: source (e.g., 'human')
    AND s.data_type = 'NUMERIC'
GROUP BY
    score_day,
    s.name,
    t.name
ORDER BY
    score_day,
    score_name,
    trace_name;
`;

// --- API Handler ---
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  let pool: Pool | null = null;

  try {
    const {
      queryId,
      projectId,
      fromTimestamp,
      toTimestamp,
      // Query 1 specific params
      tagsFilterValue, // e.g., "tag-a"
      metadataJsonPath, // e.g., "$.customer"
      metadataValue,    // e.g., "important"
      // Query 3 specific params
      scoreSource,      // e.g., "human"
      joinTraces,       // boolean for Query 3
    } = req.body;

    // Basic validation
    if (!queryId || !projectId || !fromTimestamp || !toTimestamp) {
      return res.status(400).json({ error: "Missing required parameters (queryId, projectId, fromTimestamp, toTimestamp)." });
    }

    // Initialize DB pool
    pool = new Pool({
      host: env.GREPTIMEDB_HOST,
      database: env.GREPTIMEDB_DATABASE,
      user: env.GREPTIMEDB_USER, // Ensure these are set in your environment
      password: env.GREPTIMEDB_PASSWORD, // Ensure these are set
      port: parseInt(env.GREPTIMEDB_PORT_PGSQL ?? "4003", 10),
      ssl: env.GREPTIMEDB_ENABLE_SSL === "true" ? { rejectUnauthorized: false } : false, // Basic SSL, adjust as needed for production
    });

    pool.on('error', (err, client) => {
      logger.error('Unexpected error on idle client in pg pool', { error: err });
    });

    let sqlQuery = "";
    let queryParams: any[] = [];

    switch (queryId) {
      case "query1_complex_trace":
        if (!tagsFilterValue || !metadataJsonPath || !metadataValue) {
            return res.status(400).json({ error: "Missing parameters for Query 1 (tagsFilterValue, metadataJsonPath, metadataValue)." });
        }
        sqlQuery = QUERY_1_COMPLEX_TRACE;
        // Construct the LIKE pattern carefully for tags
        const tagsLikePattern = `%\"${tagsFilterValue}\"%`;
        queryParams = [projectId, fromTimestamp, toTimestamp, tagsLikePattern, metadataJsonPath, metadataValue];
        break;
      case "query2_observation_performance":
        sqlQuery = QUERY_2_OBSERVATION_PERFORMANCE;
        queryParams = [projectId, fromTimestamp, toTimestamp];
        break;
      case "query3_score_analysis":
        if (!scoreSource) {
            return res.status(400).json({ error: "Missing parameter for Query 3 (scoreSource)." });
        }
        sqlQuery = joinTraces === true ? QUERY_3_SCORE_ANALYSIS_WITH_JOIN : QUERY_3_SCORE_ANALYSIS_NO_JOIN;
        queryParams = [projectId, fromTimestamp, toTimestamp, scoreSource];
        break;
      default:
        return res.status(400).json({ error: "Invalid queryId provided." });
    }

    logger.info("Executing GreptimeDB debug query", { queryId, projectId, params: queryParams, sql: sqlQuery });

    const startTime = Date.now();
    const result = await pool.query(sqlQuery, queryParams);
    const duration = Date.now() - startTime;

    logger.info(`GreptimeDB query ${queryId} executed successfully in ${duration}ms`, { rowCount: result.rowCount });

    res.status(200).json({
      queryId,
      durationMs: duration,
      rowCount: result.rowCount,
      rows: result.rows,
    });
  } catch (e: any) {
    logger.error("Failed to execute GreptimeDB debug query", { error: e.message, stack: e.stack, queryBody: req.body });
    res.status(500).json({
      error: "Failed to execute query",
      details: e.message,
      queryId: req.body.queryId,
    });
  } finally {
    if (pool) {
      await pool.end().catch(err => {
        logger.error("Error closing GreptimeDB pool", { error: err });
      });
    }
  }
}
