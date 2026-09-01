WITH trace_metrics AS
(
    SELECT
        trace_id,
        sum(sum_cost) AS trace_cost
    FROM trace_metrics_5m_benchmark
    WHERE project_id = {projectId: String}
      AND bucket >= {from: DateTime64(6)}
      AND bucket < {to: DateTime64(6)}
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
)
SELECT
    e.trace_id,
    e.span_id,
    e.start_time,
    t.trace_cost
FROM
(
    SELECT project_id, trace_id, span_id, start_time
    FROM events_core
    WHERE project_id = {projectId: String}
      AND start_time >= {from: DateTime64(6)}
      AND start_time < {to: DateTime64(6)}
      AND trace_id LIKE {tracePrefix: String}
      AND is_deleted = 0
    ORDER BY event_ts DESC
    LIMIT 1 BY project_id, trace_id, span_id
) AS e
INNER JOIN trace_metrics AS t ON e.trace_id = t.trace_id
ORDER BY t.trace_cost DESC, e.start_time DESC, e.span_id
LIMIT 50
