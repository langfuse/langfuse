-- Join on five-minute bucket. Attaches a fragment, not the trace total.
WITH
    gold AS
    (
        SELECT
            trace_id,
            sum(toFloat64(cost_details['total'])) AS cost
        FROM
        (
            SELECT trace_id, span_id, parent_span_id, cost_details
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
    ),
    events AS
    (
        SELECT project_id, trace_id, span_id, start_time
        FROM events_core
        WHERE project_id = {projectId: String}
          AND start_time >= {from: DateTime64(6)}
          AND start_time < {to: DateTime64(6)}
          AND trace_id LIKE {tracePrefix: String}
          AND is_deleted = 0
          AND parent_span_id != ''
        ORDER BY event_ts DESC
        LIMIT 1 BY project_id, trace_id, span_id
    )
SELECT
    toUInt64(count()) AS event_rows,
    toUInt64(countIf(abs(c.sum_cost - g.cost) > 1e-9)) AS fragment_ne_trace_cost,
    round(100 * countIf(abs(c.sum_cost - g.cost) > 1e-9) / greatest(count(), 1), 4) AS pct_wrong_cost
FROM events AS e
INNER JOIN gold AS g ON e.trace_id = g.trace_id
LEFT JOIN trace_metrics_5m_benchmark AS c
    ON e.project_id = c.project_id
   AND e.trace_id = c.trace_id
   AND toStartOfFiveMinutes(e.start_time) = c.bucket
