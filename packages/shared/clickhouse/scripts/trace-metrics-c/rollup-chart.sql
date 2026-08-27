SELECT
    toDate(min_start) AS day,
    avg(cost) AS avg_cost,
    quantile(0.95)(latency_ms) AS p95_latency_ms,
    count() AS trace_count
FROM
(
    SELECT
        trace_id,
        sum(sum_cost) AS cost,
        min(min_start) AS min_start,
        dateDiff('millisecond', min(min_start), maxMerge(max_end)) AS latency_ms
    FROM trace_metrics_5m_benchmark
    WHERE project_id = {projectId: String}
      AND bucket >= toStartOfFiveMinutes({from: DateTime64(6)})
      AND bucket < toStartOfFiveMinutes({to: DateTime64(6)}) + INTERVAL 5 MINUTE
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
)
GROUP BY day
ORDER BY day
