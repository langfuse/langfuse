-- Rollup side of the fold factor: how many rows a trace costs in the 5m table.
SELECT
    toUInt64(count()) AS rollup_rows,
    toUInt64(uniqExact(trace_id)) AS traces,
    round(count() / greatest(uniqExact(trace_id), 1), 4) AS rollup_rows_per_trace
FROM trace_metrics_5m_benchmark
WHERE project_id = {projectId: String}
  AND bucket >= {from: DateTime64(6)}
  AND bucket < {to: DateTime64(6)}
  AND trace_id LIKE {tracePrefix: String}
