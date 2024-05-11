  

-- ReplacingMergeTree does not work here as values for sorted columns might change with updates and only equal values in all sorting keys are deduped.  
-- +goose Up
CREATE TABLE traces
(
    `id` String,
    `timestamp` DateTime64,
    `name` Nullable(String),
    `user_id` Nullable(String),
    `metadata` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `release` Nullable(String),
    `version` Nullable(String),
    `project_id` String,
    `public` Bool,
    `bookmarked` Bool,
    `tags` Array(String),
    `input`  Nullable(String),
    `output`  Nullable(String),
    `session_id` Nullable(String),
    `created_at` DateTime64,
    `updated_at` DateTime64,
)
ENGINE = ReplacingMergeTree(created_at)
PRIMARY KEY (project_id, toDate(created_at))
ORDER BY (project_id, toDate(created_at), id);

-- +goose Down
DROP TABLE traces;

