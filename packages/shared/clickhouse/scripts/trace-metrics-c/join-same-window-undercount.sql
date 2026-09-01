-- Events in this window joined to C filtered to the same window, versus C over
-- the whole populated table. Non-zero undercount is the "same window" trap.
WITH
    traces_in_window AS
    (
        SELECT DISTINCT trace_id
        FROM events_core
        WHERE project_id = {projectId: String}
          AND start_time >= {from: DateTime64(6)}
          AND start_time < {to: DateTime64(6)}
          AND trace_id LIKE {tracePrefix: String}
          AND is_deleted = 0
          AND parent_span_id != ''
    ),
    c_window AS
    (
        SELECT trace_id, sum(sum_cost) AS cost
        FROM trace_metrics_5m_benchmark
        WHERE project_id = {projectId: String}
          AND bucket >= {from: DateTime64(6)}
          AND bucket < {to: DateTime64(6)}
          AND trace_id LIKE {tracePrefix: String}
        GROUP BY trace_id
    ),
    c_full AS
    (
        SELECT trace_id, sum(sum_cost) AS cost
        FROM trace_metrics_5m_benchmark
        WHERE project_id = {projectId: String}
          AND trace_id LIKE {tracePrefix: String}
        GROUP BY trace_id
    )
SELECT
    toUInt64(count()) AS traces_in_event_window,
    toUInt64(countIf(abs(w.cost - f.cost) > 1e-9)) AS traces_undercounted_same_window,
    round(100 * countIf(abs(w.cost - f.cost) > 1e-9) / greatest(count(), 1), 4) AS pct_undercounted
FROM traces_in_window AS t
INNER JOIN c_full AS f ON t.trace_id = f.trace_id
LEFT JOIN c_window AS w ON t.trace_id = w.trace_id
