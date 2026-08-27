-- What the rollup actually removes: raw event versions -> deduplicated spans.
-- Gold pays both reductions at query time; the rollup pays them once at write.
SELECT
    toUInt64(count()) AS raw_event_rows,
    toUInt64(uniqExact((trace_id, span_id))) AS unique_spans,
    toUInt64(uniqExact(trace_id)) AS traces,
    round(count() / greatest(uniqExact((trace_id, span_id)), 1), 4) AS versions_per_span,
    round(count() / greatest(uniqExact(trace_id), 1), 4) AS raw_rows_per_trace,
    round(uniqExact((trace_id, span_id)) / greatest(uniqExact(trace_id), 1), 4) AS spans_per_trace
FROM events_core
WHERE project_id = {projectId: String}
  AND start_time >= {from: DateTime64(6)}
  AND start_time < {to: DateTime64(6)}
  AND trace_id LIKE {tracePrefix: String}
  AND is_deleted = 0
