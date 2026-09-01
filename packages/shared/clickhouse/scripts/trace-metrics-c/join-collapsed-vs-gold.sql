-- Events-first join to collapsed C. Attached trace_cost must match gold.
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
    collapsed AS
    (
        SELECT
            trace_id,
            sum(sum_cost) AS cost
        FROM trace_metrics_5m_benchmark
        WHERE project_id = {projectId: String}
          AND bucket >= {from: DateTime64(6)}
          AND bucket < {to: DateTime64(6)}
          AND trace_id LIKE {tracePrefix: String}
        GROUP BY trace_id
    ),
    events AS
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
    )
SELECT
    toUInt64(count()) AS event_rows,
    toUInt64(uniqExact((e.trace_id, e.span_id))) AS unique_spans,
    toUInt64(countIf(abs(c.cost - g.cost) > 1e-9)) AS cost_mismatches,
    toUInt64(countIf(c.cost IS NULL)) AS events_missing_rollup,
    toUInt64(countIf(g.cost IS NULL)) AS events_missing_gold
FROM events AS e
LEFT JOIN collapsed AS c ON e.trace_id = c.trace_id
LEFT JOIN gold AS g ON e.trace_id = g.trace_id
