CREATE TABLE trace_metrics_5m_benchmark
(
    project_id String,
    bucket DateTime,
    trace_id String,
    sum_cost SimpleAggregateFunction(sum, Float64),
    sum_tokens SimpleAggregateFunction(sum, UInt64),
    min_start SimpleAggregateFunction(min, DateTime64(6)),
    max_end SimpleAggregateFunction(max, Nullable(DateTime64(6))),
    span_count SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (project_id, bucket, trace_id)
