CREATE TABLE dataset_run_items (
    -- primary identifiers
    `id` String,
    `project_id` String,
    `dataset_run_id` String,
    `dataset_item_id` String,
    `trace_id` String,
    `observation_id` Nullable(String),
    `dataset_id` String,

    -- error field 
    `error` Nullable(String),

    -- denormalized trace fields (mutable, but snapshots are relevant)
    `output` CODEC(ZSTD(3)), -- json
    
    -- denormalized immutable dataset run fields
    `dataset_run_name` String,
    `dataset_run_description` Nullable(String),
    `dataset_run_metadata` Nullable(String) CODEC(ZSTD(3)), -- json  
    `dataset_run_created_at` DateTime64(3),

    -- denormalized dataset item fields (mutable, but snapshots are relevant)
    `dataset_item_input` CODEC(ZSTD(3)), -- json
    `dataset_item_expected_output` CODEC(ZSTD(3)), -- json
    `dataset_item_metadata` CODEC(ZSTD(3)), -- json

    -- timestamps 
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),

    -- clickhouse engine fields 
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,

    -- TODO: Could consider materialized view to represent mapping of dataset_id -> dataset_run_id 
    -- TODO: Use skip index to cater to multiple dataset_run_items per dataset_item

    -- For dataset item lookups
    INDEX idx_dataset_item dataset_item_id TYPE bloom_filter(0.001) GRANULARITY 1,
) ENGINE = ReplacingMergeTree(event_ts, is_deleted) 
Partition BY toYYYYMM(created_at)
ORDER BY (project_id, dataset_id, dataset_run_id, id); 
