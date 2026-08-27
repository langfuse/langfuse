SELECT
    trace_id,
    sum(toFloat64(cost_details['total'])) AS cost,
    sum(usage_details['total']) AS tokens,
    min(start_time) AS min_start,
    max(end_time) AS max_end,
    dateDiff('millisecond', min(start_time), max(end_time)) AS latency_ms,
    toUInt64(count()) AS span_count
FROM
(
    SELECT
        trace_id,
        span_id,
        parent_span_id,
        start_time,
        end_time,
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
GROUP BY trace_id
