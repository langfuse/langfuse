-- Join events to ungrouped C. Extra rows = traces that occupy 2+ buckets.
WITH events AS
(
    SELECT project_id, trace_id, span_id
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
    toUInt64(count()) AS joined_rows,
    toUInt64(uniqExact((e.trace_id, e.span_id))) AS unique_spans,
    toUInt64(count() - uniqExact((e.trace_id, e.span_id))) AS duplicate_event_rows
FROM events AS e
INNER JOIN trace_metrics_5m_benchmark AS c
    ON e.project_id = c.project_id AND e.trace_id = c.trace_id
WHERE c.bucket >= {from: DateTime64(6)}
  AND c.bucket < {to: DateTime64(6)}
