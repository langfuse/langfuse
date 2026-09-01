-- Job B: daily observation rollup without trace_id in the ORDER BY.
-- user_id is a dashboard dimension, not a pick-one attribute on a traces row.
CREATE TABLE obs_daily_agg_benchmark
(
    project_id String,
    day Date,
    user_id String,
    sum_cost SimpleAggregateFunction(sum, Float64),
    sum_tokens SimpleAggregateFunction(sum, UInt64),
    span_count SimpleAggregateFunction(sum, UInt64),
    traces AggregateFunction(uniqExact, String)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (project_id, day, user_id)
