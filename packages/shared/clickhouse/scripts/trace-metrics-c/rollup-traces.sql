SELECT
    trace_id,
    sum(sum_cost) AS cost,
    sum(sum_tokens) AS tokens,
    min(min_start) AS min_start,
    maxMerge(max_end) AS max_end,
    dateDiff('millisecond', min(min_start), maxMerge(max_end)) AS latency_ms,
    sum(span_count) AS span_count
FROM trace_metrics_5m_benchmark
WHERE project_id = {projectId: String}
  AND bucket >= toStartOfFiveMinutes({from: DateTime64(6)})
  AND bucket < toStartOfFiveMinutes({to: DateTime64(6)}) + INTERVAL 5 MINUTE
  AND trace_id LIKE {tracePrefix: String}
GROUP BY trace_id
