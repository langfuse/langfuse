-- Filter C first (expensive traces), then fetch their events.
-- This is the traces-first / nested UX.
WITH expensive AS
(
    SELECT trace_id
    FROM trace_metrics_5m_benchmark
    WHERE project_id = {projectId: String}
      AND bucket >= {from: DateTime64(6)}
      AND bucket < {to: DateTime64(6)}
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
    ORDER BY sum(sum_cost) DESC, trace_id
    LIMIT {limit: UInt32}
)
SELECT
    toUInt64(count()) AS event_rows,
    toUInt64(uniqExact(e.trace_id)) AS traces
FROM
(
    SELECT trace_id, span_id
    FROM events_core
    WHERE project_id = {projectId: String}
      AND start_time >= {from: DateTime64(6)}
      AND start_time < {to: DateTime64(6)}
      AND trace_id LIKE {tracePrefix: String}
      AND is_deleted = 0
      AND parent_span_id != ''
    ORDER BY event_ts DESC
    LIMIT 1 BY project_id, trace_id, span_id
) AS e
INNER JOIN expensive AS t ON e.trace_id = t.trace_id
