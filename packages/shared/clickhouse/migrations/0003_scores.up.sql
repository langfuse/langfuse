CREATE TABLE scores (
    id String,
    `timestamp` DateTime64(6),
    project_id String,
    `name` String,
    `value` Float64,
    source String,
    comment Nullable(String) CODEC(ZSTD(1)),
    trace_id String,
    observation_id Nullable(String),
    created_at DateTime64(6) DEFAULT now(),
    event_ts DateTime64(6),
    event_microseconds UInt32,
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1
) ENGINE = MergeTree Partition by toYYYYMM(timestamp)
ORDER BY (
        project_id,
        name,
        toUnixTimestamp(timestamp),
        id
    );