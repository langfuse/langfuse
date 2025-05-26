-- GreptimeDB/DataFusion SQL Query Examples for Langfuse Analytics

-- Query 1: Complex Trace Query
-- Intent: Get daily count of traces, sum of their observation counts, and sum of their total costs,
-- grouped by trace `name` and `user_id`. Filter by `project_id`, time range, specific `tags`, and `metadata`.
WITH TraceObservationAggregates AS (
    SELECT
        trace_id,
        COUNT(id) AS observation_count,
        SUM(total_cost) AS total_observation_cost
    FROM
        observations
    WHERE
        project_id = 'your_project_id' -- Filter here as well for efficiency
        AND start_time >= '2023-01-01T00:00:00Z' -- Example time range start
        AND start_time < '2023-01-31T00:00:00Z'  -- Example time range end
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
    t.project_id = 'your_project_id'
    AND t.timestamp >= '2023-01-01T00:00:00Z' -- Example time range start
    AND t.timestamp < '2023-01-31T00:00:00Z'  -- Example time range end
    -- Filtering on 'tags' (JSON array string like '["tag-a", "tag-b"]'):
    -- Using LIKE for basic substring check. GreptimeDB might offer better JSON array search capabilities.
    AND t.tags LIKE '%"tag-a"%'
    -- Filtering on 'metadata' (JSON object string like '{"customer": "important"}'):
    AND json_extract_path_text(t.metadata, '$.customer') = 'important' -- DataFusion/GreptimeDB JSON path extraction
GROUP BY
    trace_day,
    t.name,
    t.user_id
ORDER BY
    trace_day,
    trace_name,
    trace_user_id;

-- Notes for Query 1:
-- 1. Timestamp Precision: GreptimeDB TIMESTAMP(3) stores milliseconds. Timestamps are ISO 8601.
-- 2. JSON Filtering:
--    - `tags`: `LIKE '%"tag-a"%'` is a basic workaround. Advanced JSON array search might need UDFs or specific operators in GreptimeDB.
--    - `metadata`: `json_extract_path_text` is standard for JSON object value extraction.
-- 3. `date_trunc`: Standard for time grouping. GreptimeDB's `time_bucket` could be an alternative.
-- 4. Performance: Filtering in the CTE is recommended.


-- Query 2: Observation Performance Analysis
-- Intent: Hourly p95 of `latency`, p95 `timeToFirstToken`, and average `totalTokens` for 'GENERATION' type observations.
-- Group by observation `name` and `provided_model_name`. Filter by `project_id` and time range.
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
    project_id = 'your_project_id'
    AND type = 'GENERATION'
    AND start_time >= '2023-01-01T00:00:00Z' -- Example time range start
    AND start_time < '2023-01-02T00:00:00Z'  -- Example time range end (e.g., 1 day for hourly)
    AND end_time IS NOT NULL             -- Ensure timestamps for calculation are not null
    AND completion_start_time IS NOT NULL -- Ensure timestamps for calculation are not null
    AND usage_details IS NOT NULL        -- Ensure usage_details is not null
    AND json_extract_path_text(usage_details, '$.total_tokens') IS NOT NULL -- Ensure total_tokens can be extracted
GROUP BY
    hour_bucket,
    name,
    provided_model_name
ORDER BY
    hour_bucket,
    observation_name,
    provided_model_name;

-- Notes for Query 2:
-- 1. Timestamp Arithmetic: Timestamps are cast to BIGINT (milliseconds) for subtraction. Result divided by 1000.0 for seconds.
-- 2. Quantiles: `approx_percentile_cont` is the standard SQL function.
-- 3. JSON Extraction: `json_extract_path_text(usage_details, '$.total_tokens')` extracts total_tokens, then cast to FLOAT64.
-- 4. Filtering NULLs: Important for calculations and JSON extraction to prevent errors.
-- 5. Gap Filling: Not implemented. Would require generating a time series and LEFT JOINing.


-- Query 3: Score Analysis (Numeric)
-- Intent: Average numeric score `value` and count of scores, for 'human'-sourced scores.
-- Group by score `name` and `trace_id` (or `trace.name` if joining). Filter by `project_id` and time range.

-- Version 1: Grouping by trace_id (no JOIN)
SELECT
    date_trunc('day', timestamp) AS score_day, -- Example: daily aggregation
    name AS score_name,
    trace_id,
    AVG(value) AS average_score_value,
    COUNT(id) AS score_count
FROM
    scores
WHERE
    project_id = 'your_project_id'
    AND timestamp >= '2023-01-01T00:00:00Z' -- Example time range start
    AND timestamp < '2023-01-31T00:00:00Z'  -- Example time range end
    AND source = 'human'
    AND data_type = 'NUMERIC' -- Assuming 'NUMERIC' string value for data_type TAG
GROUP BY
    score_day,
    name,
    trace_id
ORDER BY
    score_day,
    score_name,
    trace_id;

-- Version 2: Grouping by trace.name (requires JOIN with traces)
SELECT
    date_trunc('day', s.timestamp) AS score_day, -- Example: daily aggregation
    s.name AS score_name,
    t.name AS trace_name, -- From joined traces table
    AVG(s.value) AS average_score_value,
    COUNT(s.id) AS score_count
FROM
    scores s
LEFT JOIN
    traces t ON s.trace_id = t.id AND s.project_id = t.project_id -- Join on project_id for safety
WHERE
    s.project_id = 'your_project_id'
    AND s.timestamp >= '2023-01-01T00:00:00Z' -- Example time range start
    AND s.timestamp < '2023-01-31T00:00:00Z'  -- Example time range end
    AND s.source = 'human'
    AND s.data_type = 'NUMERIC' -- Assuming 'NUMERIC' string value
GROUP BY
    score_day,
    s.name,
    t.name
ORDER BY
    score_day,
    score_name,
    trace_name;

-- Notes for Query 3:
-- 1. `data_type` Filter: Assumes numeric scores are identified by `data_type = 'NUMERIC'`.
-- 2. `source` Filter: `source` is a TAG and directly filterable.
-- 3. JOIN Condition (Version 2): Joining on `project_id` in addition to `trace_id` is recommended.
-- 4. Aggregation Granularity: `date_trunc('day', timestamp)` added for time-based grouping.
-- 5. `value` type: `scores.value` is FLOAT64, suitable for AVG().
