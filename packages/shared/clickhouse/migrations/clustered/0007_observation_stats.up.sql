CREATE TABLE observation_stats ON CLUSTER default
(
    `project_id` String,
    `trace_id` String,
    `count` AggregateFunction(uniq, String),
    `min_start_time` SimpleAggregateFunction(min, Nullable(DateTime64(3))),
    `max_start_time` SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `max_end_time` SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `unique_levels` SimpleAggregateFunction(groupUniqArrayArray, Array(String))
) ENGINE = AggregatingMergeTree()
ORDER BY (project_id, trace_id);
