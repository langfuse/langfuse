SELECT
    quantileExact(0.5)(bucket_count) AS p50,
    quantileExact(0.95)(bucket_count) AS p95,
    quantileExact(0.99)(bucket_count) AS p99,
    max(bucket_count) AS max
FROM
(
    SELECT trace_id, count() AS bucket_count
    FROM trace_metrics_5m_benchmark
    WHERE project_id = {projectId: String}
      AND bucket >= toStartOfFiveMinutes({from: DateTime64(6)})
      AND bucket < toStartOfFiveMinutes({to: DateTime64(6)}) + INTERVAL 5 MINUTE
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
)
