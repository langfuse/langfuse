CREATE TABLE observation_costs ON CLUSTER default (
    `id` String,
    `trace_id` String,
    `project_id` String,
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `name` String,
    `metadata` Map(LowCardinality(String), String),
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal64(12)),
    `cost_details` Map(LowCardinality(String), Decimal64(12)),
    `total_cost` Nullable(Decimal64(12)),
    `level` LowCardinality(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    event_ts DateTime64(3),
    is_deleted UInt8
) ENGINE = ReplacingMergeTree(event_ts, is_deleted) Partition by toYYYYMM(start_time)
PRIMARY KEY (
    project_id,
    trace_id,
    toDate(start_time),
    `type`
)
ORDER BY (
    project_id,
    trace_id,
    toDate(start_time),
    `type`,
    id
);
