-- Roll-up C: attribute the whole trace to min(start_time)'s day, then sum.
-- This is "trace total that day", not "cost incurred that day".
SELECT
    day,
    sum(cost) AS sum_cost,
    sum(span_count) AS span_count,
    toUInt64(count()) AS traces
FROM
(
    SELECT
        toDate(min(tm.min_start)) AS day,
        sum(tm.sum_cost) AS cost,
        sum(tm.span_count) AS span_count
    FROM trace_metrics_5m_benchmark AS tm
    WHERE project_id = {projectId: String}
      AND bucket >= toStartOfDay({from: DateTime64(6)}) + INTERVAL 1 DAY
      AND bucket < toStartOfDay({to: DateTime64(6)})
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
)
WHERE day >= toDate(toStartOfDay({from: DateTime64(6)}) + INTERVAL 1 DAY)
  AND day < toDate(toStartOfDay({to: DateTime64(6)}))
GROUP BY day
ORDER BY day
