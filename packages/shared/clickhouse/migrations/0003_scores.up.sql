CREATE TABLE scores (
    id String,
    `timestamp` DateTime64(3),
    project_id String,
    `name` String,
    `value` Float64,
    source String,
    comment Nullable(String) CODEC(ZSTD(1)),
    trace_id String,
    observation_id Nullable(String),
    created_at DateTime64(3) DEFAULT now(),
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1
) ENGINE = ReplacingMergeTree Partition by toYYYYMM(timestamp)
ORDER BY (
        project_id,
        trace_id,
        toUnixTimestamp(timestamp),
        id
    );