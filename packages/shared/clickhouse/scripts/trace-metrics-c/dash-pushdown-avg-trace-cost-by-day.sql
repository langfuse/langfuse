-- Push-down: average *trace* total by the trace's min(start_time) day.
SELECT
    toDate(min_start) AS day,
    avg(cost) AS avg_cost,
    toUInt64(count()) AS traces
FROM
(
    SELECT
        trace_id,
        sum(toFloat64(cost_details['total'])) AS cost,
        min(start_time) AS min_start
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
    GROUP BY trace_id
)
GROUP BY day
ORDER BY day
