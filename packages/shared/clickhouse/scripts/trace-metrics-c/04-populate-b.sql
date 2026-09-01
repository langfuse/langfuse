INSERT INTO obs_daily_agg_benchmark
SELECT
    project_id,
    toDate(start_time) AS day,
    user_id,
    sum(toFloat64(cost_details['total'])) AS sum_cost,
    sum(usage_details['total']) AS sum_tokens,
    toUInt64(count()) AS span_count,
    uniqExactState(trace_id) AS traces
FROM
(
    SELECT
        project_id,
        trace_id,
        span_id,
        parent_span_id,
        start_time,
        user_id,
        cost_details,
        usage_details
    FROM events_core
    WHERE project_id = {projectId: String}
      AND start_time >= {from: DateTime64(6)}
      AND start_time < {to: DateTime64(6)}
      AND trace_id LIKE {tracePrefix: String}
      AND is_deleted = 0
    ORDER BY event_ts DESC
    LIMIT 1 BY project_id, trace_id, span_id
)
WHERE parent_span_id != ''
GROUP BY project_id, day, user_id
