-- Push-down: sum observation cost by the span's start day.
-- Complete calendar days only, matching the daily rollup (partial days
-- would UNION raw events_core in production).
SELECT
    toDate(start_time) AS day,
    sum(toFloat64(cost_details['total'])) AS sum_cost,
    toUInt64(count()) AS span_count,
    toUInt64(uniqExact(trace_id)) AS traces
FROM
(
    SELECT
        trace_id,
        span_id,
        parent_span_id,
        start_time,
        cost_details
    FROM events_core
    WHERE project_id = {projectId: String}
      AND start_time >= toStartOfDay({from: DateTime64(6)}) + INTERVAL 1 DAY
      AND start_time < toStartOfDay({to: DateTime64(6)})
      AND trace_id LIKE {tracePrefix: String}
      AND is_deleted = 0
    ORDER BY event_ts DESC
    LIMIT 1 BY project_id, trace_id, span_id
)
WHERE parent_span_id != ''
GROUP BY day
ORDER BY day
