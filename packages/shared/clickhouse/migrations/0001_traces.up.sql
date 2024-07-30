CREATE TABLE traces (
    `id` String,
    `timestamp` DateTime64(3),
    `name` String,
    `user_id` Nullable(String),
    `metadata` Map(String, String) CODEC(ZSTD(1)),
    `release` Nullable(String),
    `version` Nullable(String),
    `project_id` String,
    `public` Bool,
    `bookmarked` Bool,
    `tags` Array(String),
    `input` Nullable(String) CODEC(ZSTD(1)),
    `output` Nullable(String) CODEC(ZSTD(1)),
    `session_id` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = ReplacingMergeTree Partition by toYYYYMM(timestamp)
ORDER BY (
        project_id,
        toUnixTimestamp(timestamp),
        id
    );