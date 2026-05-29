CREATE TABLE IF NOT EXISTS events_core
(
    project_id String,
    trace_id String,
    span_id String,
    parent_span_id String,

    start_time DateTime64(6),
    end_time Nullable(DateTime64(6)),

    -- Core properties
    name String,
    type LowCardinality(String),
    environment LowCardinality(String) DEFAULT 'default',
    version String,
    release String,
    trace_name String,
    user_id String,
    session_id String,
    tags Array(String),
    level LowCardinality(String),
    status_message String,
    completion_start_time Nullable(DateTime64(6)),
    is_app_root Bool DEFAULT false,

    -- Updateable properties
    bookmarked Bool DEFAULT false,
    public Bool DEFAULT false,

    -- Prompt
    prompt_id String,
    prompt_name String,
    prompt_version Nullable(UInt16),

    -- Model
    model_id String,
    provided_model_name String,
    model_parameters String,

    -- Usage
    provided_usage_details Map(LowCardinality(String), UInt64),
    usage_details Map(LowCardinality(String), UInt64),
    provided_cost_details Map(LowCardinality(String), Decimal(18,12)),
    cost_details Map(LowCardinality(String), Decimal(18,12)),
    calculated_input_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details))),
    calculated_output_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
    calculated_total_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0 OR positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
    total_cost Decimal(18, 12) ALIAS cost_details['total'],

    usage_pricing_tier_id Nullable(String),
    usage_pricing_tier_name Nullable(String),

    -- Tools
    tool_definitions Map(String, String),
    tool_calls Array(String),
    tool_call_names Array(String),

    -- I/O
    input String,
    input_length UInt64 MATERIALIZED lengthUTF8(input),
    output String,
    output_length UInt64 MATERIALIZED lengthUTF8(output),

    -- Metadata
    metadata_names Array(String),
    metadata_values Array(String),

    -- Experiment properties
    experiment_id String,
    experiment_name String,
    experiment_metadata_names Array(String),
    experiment_metadata_values Array(String),
    experiment_description String,
    experiment_dataset_id String,
    experiment_item_id String,
    experiment_item_version Nullable(DateTime64(6)),
    experiment_item_expected_output String,
    experiment_item_metadata_names Array(String),
    experiment_item_metadata_values Array(String),
    experiment_item_root_span_id String,

    -- Source metadata (Instrumentation)
    source LowCardinality(String),
    service_name String,
    service_version String,
    scope_name String,
    scope_version String,
    telemetry_sdk_language LowCardinality(String),
    telemetry_sdk_name String,
    telemetry_sdk_version String,

    -- Generic props
    blob_storage_file_path String,
    event_bytes UInt64,
    created_at DateTime64(6) DEFAULT now(),
    updated_at DateTime64(6) DEFAULT now(),
    event_ts DateTime64(6),
    is_deleted UInt8,

    -- Indexes
    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1,
    INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 1,
    INDEX idx_provided_model_name provided_model_name TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_experiment_id experiment_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_metadata_names metadata_names TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    prewarm_mark_cache = 1,
    prewarm_primary_key_cache = 1;
