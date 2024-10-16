CREATE TABLE observations (
    `id` String,
    `trace_id` String,
    `project_id` String,
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `name` String,
    `metadata` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `level` LowCardinality(String),
    `status_message` Nullable(String),
    `version` Nullable(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `provided_model_name` Nullable(String),
    `internal_model_id` Nullable(String),
    `model_parameters` Nullable(String),
    `provided_input_usage_units` Nullable(Decimal64(12)),
    `provided_output_usage_units` Nullable(Decimal64(12)),
    `provided_total_usage_units` Nullable(Decimal64(12)),
    `input_usage_units` Nullable(Decimal64(12)),
    `output_usage_units` Nullable(Decimal64(12)),
    `total_usage_units` Nullable(Decimal64(12)),
    `unit` Nullable(String),
    `provided_input_cost` Nullable(Decimal64(12)),
    `provided_output_cost` Nullable(Decimal64(12)),
    `provided_total_cost` Nullable(Decimal64(12)),
    `input_cost` Nullable(Decimal64(12)),
    `output_cost` Nullable(Decimal64(12)),
    `total_cost` Nullable(Decimal64(12)),
    `completion_start_time` Nullable(DateTime64(3)),
    `time_to_first_token` Nullable(Decimal64(12)),
    `prompt_id` Nullable(String),
    `prompt_name` Nullable(String),
    `prompt_version` Nullable(UInt16),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    event_ts DateTime64(3),
    INDEX idx_id id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_project_id project_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter() GRANULARITY 1
) ENGINE = ReplacingMergeTree Partition by toYYYYMM(start_time)
ORDER BY (
        project_id,
        `type`,
        toDate(start_time),
        id
    );

