CREATE TABLE dataset_run_items (
    -- primary identifiers
    `id` String,
    `project_id` String,
    `dataset_run_id` String,
    `dataset_item_id` String,
    `trace_id` String,
    `observation_id` Nullable(String),

    -- denormalized dataset run fields
    `dataset_id` String,
    `dataset_run_name` String,
    -- TODO: consider dropping metadata 
    `dataset_run_metadata` Nullable(String) CODEC(ZSTD(3)), -- json  

    -- denormalized dataset item fields
    `dataset_item_input` Nullable(String) CODEC(ZSTD(3)), -- json
    `dataset_item_expected_output` Nullable(String) CODEC(ZSTD(3)), -- json
    `dataset_item_metadata` Nullable(String) CODEC(ZSTD(3)), -- json

    -- timestamps 
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),

    -- clickhouse engine fields 
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,

    -- performance indexes
    -- TODO: require review 
    INDEX idx_run_item (dataset_run_id, dataset_item_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_trace trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_dataset_item dataset_item_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_latency_cost (trace_latency, trace_cost) TYPE minmax GRANULARITY 1

) ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted) 
Partition BY toYYYYMM(created_at)
ORDER BY (project_id, dataset_id, dataset_run_id, id);
-- TODO: Could consider materialized view to represent mapping of dataset_id -> dataset_run_id 
-- TODO: Use skip index to cater to multiple dataset_run_items per dataset_item
-- TODO: trial and error for query engine on popular queries with other partitions and order by 
