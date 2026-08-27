SELECT
    toDate(min_start) AS day,
    avg(cost) AS avg_cost,
    quantile(0.95)(latency_ms) AS p95_latency_ms,
    count() AS trace_count
FROM
(
    SELECT
        trace_id,
        sum(tm.sum_cost) AS cost,
        min(tm.min_start) AS min_start,
        dateDiff('millisecond', min(tm.min_start), max(tm.max_end)) AS latency_ms
    FROM trace_metrics_5m_benchmark AS tm
    WHERE project_id = {projectId: String}
      AND bucket >= toStartOfFiveMinutes({from: DateTime64(6)})
      AND bucket < toStartOfFiveMinutes({to: DateTime64(6)}) + INTERVAL 5 MINUTE
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
)
GROUP BY day
ORDER BY day
