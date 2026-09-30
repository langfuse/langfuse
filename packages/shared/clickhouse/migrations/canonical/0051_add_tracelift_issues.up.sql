CREATE TABLE IF NOT EXISTS tracelift_issues {CLICKHOUSE_CLUSTER_CLAUSE}
(
    `id` String,
    `project_id` String,
    `trace_id` String,
    `observation_id` Nullable(String) COMMENT 'NULL for trace-level issues',
    `issues` LowCardinality(String),
    `timestamp` DateTime64(6) COMMENT 'Start time of the source trace'
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, toDate(timestamp), trace_id, id);
