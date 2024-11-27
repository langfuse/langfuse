CREATE TABLE observation_stats ON CLUSTER default (
    `project_id` String,
    `trace_id` String,
    `count` AggregateFunction(uniq, String),
    `min_start_time` SimpleAggregateFunction(min, DateTime64(3)),
    `max_start_time` SimpleAggregateFunction(max, DateTime64(3)),
    `max_end_time` SimpleAggregateFunction(max, DateTime64(3)),
    `sum_usage_details` SimpleAggregateFunction(sumMap, Map(String, UInt64)),
    `sum_cost_details` SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `sum_total_cost` SimpleAggregateFunction(sum, Decimal(38, 12)),
    `unique_levels` SimpleAggregateFunction(groupUniqArrayArray, Array(String))
)
ENGINE = ReplicatedAggregatingMergeTree()
ORDER BY (
    project_id,
    trace_id
);

