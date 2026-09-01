-- How much of the cohort fits inside one five-minute bucket. A high
-- pct_single_bucket is the grain working as intended, not a missing win: it
-- means one rollup row answers the trace. It also means a coarser trace-keyed
-- grain (1h, 1d) cannot reduce cardinality further.
SELECT
    toUInt64(count()) AS traces,
    toUInt64(countIf(latency_ms IS NULL)) AS unfinished_traces,
    round(100 * countIf(latency_ms <= 300000) / greatest(count(), 1), 2) AS pct_within_5m,
    toUInt64(quantileExact(0.5)(latency_ms)) AS p50_latency_ms,
    toUInt64(quantileExact(0.95)(latency_ms)) AS p95_latency_ms,
    toUInt64(quantileExact(0.99)(latency_ms)) AS p99_latency_ms,
    toUInt64(max(latency_ms)) AS max_latency_ms,
    round(100 * countIf(bucket_count = 1) / greatest(count(), 1), 2) AS pct_single_bucket,
    round(100 * countIf(bucket_count = 2) / greatest(count(), 1), 2) AS pct_two_buckets,
    round(100 * countIf(bucket_count BETWEEN 3 AND 6) / greatest(count(), 1), 2) AS pct_three_to_six_buckets,
    round(100 * countIf(bucket_count > 6) / greatest(count(), 1), 2) AS pct_over_six_buckets
FROM
(
    SELECT
        trace_id,
        count() AS bucket_count,
        dateDiff('millisecond', min(min_start), max(max_end)) AS latency_ms
    FROM trace_metrics_5m_benchmark
    WHERE project_id = {projectId: String}
      AND bucket >= {from: DateTime64(6)}
      AND bucket < {to: DateTime64(6)}
      AND trace_id LIKE {tracePrefix: String}
    GROUP BY trace_id
)
