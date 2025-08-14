CREATE TABLE dataset_run_items_rmt ON CLUSTER default (
    -- primary identifiers
    `id` String,
    `project_id` String,
    `dataset_run_id` String,
    `dataset_item_id` String,
    `dataset_id` String,
    `trace_id` String,
    `observation_id` Nullable(String),

    -- error field
    `error` Nullable(String),

     -- timestamps
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),

    -- denormalized immutable dataset run fields
    `dataset_run_name` String,
    `dataset_run_description` Nullable(String),
    `dataset_run_metadata` Map(LowCardinality(String), String),
    `dataset_run_created_at` DateTime64(3),

    -- denormalized dataset item fields (mutable, but snapshots are relevant)
    `dataset_item_input` Nullable(String) CODEC(ZSTD(3)), -- json
    `dataset_item_expected_output` Nullable(String) CODEC(ZSTD(3)), -- json
    `dataset_item_metadata` Map(LowCardinality(String), String),

    -- clickhouse engine fields
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,

    -- For dataset item lookups
    INDEX idx_dataset_item dataset_item_id TYPE bloom_filter(0.001) GRANULARITY 1,
) ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted)
ORDER BY (project_id, dataset_id, dataset_run_id, id);