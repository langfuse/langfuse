-- Roll-up C: same as dash-pushdown-avg-trace-cost-by-day.
SELECT
    day,
    avg(cost) AS avg_cost,
    toUInt64(count()) AS traces
FROM
(
    SELECT
        toDate(min(tm.min_start)) AS day,
        sum(tm.sum_cost) AS cost
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
