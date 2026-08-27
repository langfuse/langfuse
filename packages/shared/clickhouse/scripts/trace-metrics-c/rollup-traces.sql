SELECT
    trace_id,
    sum(tm.sum_cost) AS cost,
    sum(tm.sum_tokens) AS tokens,
    min(tm.min_start) AS min_start,
    max(tm.max_end) AS max_end,
    dateDiff('millisecond', min(tm.min_start), max(tm.max_end)) AS latency_ms,
    sum(tm.span_count) AS span_count
FROM trace_metrics_5m_benchmark AS tm
WHERE project_id = {projectId: String}
  AND bucket >= {from: DateTime64(6)}
  AND bucket < {to: DateTime64(6)}
  AND trace_id LIKE {tracePrefix: String}
GROUP BY trace_id
