SELECT
    trace_id,
    sum(tm.sum_cost) AS cost,
    min(tm.min_start) AS min_start,
    max(tm.max_end) AS max_end,
    dateDiff('millisecond', min(tm.min_start), max(tm.max_end)) AS latency_ms,
    sum(tm.span_count) AS span_count
FROM trace_metrics_5m_benchmark AS tm
WHERE project_id = {projectId: String}
  AND bucket >= toStartOfFiveMinutes({from: DateTime64(6)})
  AND bucket < toStartOfFiveMinutes({to: DateTime64(6)}) + INTERVAL 5 MINUTE
  AND trace_id LIKE {tracePrefix: String}
GROUP BY trace_id
ORDER BY cost DESC, trace_id
LIMIT {limit: UInt32}
