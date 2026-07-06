-- V4 events pipeline tables (clustered / replicated engines).
--
-- These were previously created out-of-band via
-- clickhouse/scripts/dev-tables.sh because they depend on ClickHouse features
-- that are only available on recent versions:
--   * `enable_block_number_column` / `enable_block_offset_column` (>= 24.5)
--   * `text` indexes / `enable_full_text_index` (>= 25.x)
-- Langfuse v4 raises the minimum ClickHouse version to 25.12, so they are now
-- promoted to a regular migration. `IF NOT EXISTS` keeps this compatible with
-- preview self-hosters that already applied the manual schema. The
-- ingestion_api_key / ingestion_sdk_name / ingestion_sdk_version columns
-- (added later via dev-tables.sh ALTERs, see #14593) are folded into the
-- initial definitions here.

-- Staging table for the dual-write pipeline that populates events_full.
-- Ingestion writes every observation (and trace-as-synthetic-observation) here
-- with an s3_first_seen_timestamp; the periodic event-propagation job in the
-- worker reads completed 3-minute partitions, joins them with `traces`, and
-- inserts the result into `events_full`.
--
-- Partitions are automatically expired after 48 hours via TTL. The 48h window
-- (vs. the 12h used internally for Langfuse Cloud) gives self-hosters a
-- multi-day grace period to recover the propagation job after an incident
-- without losing staging data. `ttl_only_drop_parts = 1` ensures only complete
-- partitions are dropped, never individual rows.
CREATE TABLE IF NOT EXISTS observations_batch_staging ON CLUSTER default
(
    id String,
    trace_id String,
    project_id String,
    type LowCardinality(String),
    parent_observation_id Nullable(String),
    start_time DateTime64(3),
    end_time Nullable(DateTime64(3)),
    name String,
    metadata Map(LowCardinality(String), String),
    level LowCardinality(String),
    status_message Nullable(String),
    version Nullable(String),
    input Nullable(String) CODEC(ZSTD(3)),
    output Nullable(String) CODEC(ZSTD(3)),
    provided_model_name Nullable(String),
    internal_model_id Nullable(String),
    model_parameters Nullable(String),
    provided_usage_details Map(LowCardinality(String), UInt64),
    usage_details Map(LowCardinality(String), UInt64),
    provided_cost_details Map(LowCardinality(String), Decimal64(12)),
    cost_details Map(LowCardinality(String), Decimal64(12)),
    total_cost Nullable(Decimal64(12)),
    usage_pricing_tier_id Nullable(String),
    usage_pricing_tier_name Nullable(String),
    tool_definitions Map(String, String),
    tool_calls Array(String),
    tool_call_names Array(String),
    completion_start_time Nullable(DateTime64(3)),
    prompt_id Nullable(String),
    prompt_name Nullable(String),
    prompt_version Nullable(UInt16),
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now(),
    event_ts DateTime64(3),
    is_deleted UInt8,
    s3_first_seen_timestamp DateTime64(3),
    environment LowCardinality(String) DEFAULT 'default',
    ingestion_api_key String DEFAULT '',
    ingestion_sdk_name LowCardinality(String) DEFAULT 'unknown',
    ingestion_sdk_version LowCardinality(String) DEFAULT 'unknown'
)
ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toStartOfInterval(s3_first_seen_timestamp, INTERVAL 3 MINUTE)
PRIMARY KEY (project_id, toDate(s3_first_seen_timestamp))
ORDER BY (
    project_id,
    toDate(s3_first_seen_timestamp),
    trace_id,
    id
)
TTL toDateTime(s3_first_seen_timestamp) + INTERVAL 48 HOUR
SETTINGS ttl_only_drop_parts = 1;

-- events_full is the immutable, full-fidelity event table that will eventually
-- replace observations. It is populated by the worker propagation job that
-- joins observations_batch_staging with traces and dataset_run_items and new
-- OTel based SDKs.
CREATE TABLE IF NOT EXISTS events_full ON CLUSTER default
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

    -- Usage and Cost
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
    input String CODEC(ZSTD(3)),
    input_length UInt64 MATERIALIZED lengthUTF8(input),
    output String CODEC(ZSTD(3)),
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

    -- Ingestion attribution
    ingestion_api_key String DEFAULT '',
    ingestion_sdk_name LowCardinality(String) DEFAULT 'unknown',
    ingestion_sdk_version LowCardinality(String) DEFAULT 'unknown',

    -- Indexes
    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1,
    INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 1,
    INDEX idx_fts_input_low lower(input) TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_output_low lower(output) TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_metadata_values metadata_values TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_metadata_names metadata_names TYPE text(tokenizer = splitByNonAlpha)
)
ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS
    index_granularity_bytes = '64Mi', -- Default 10MiB. Prevents very small granules due to large rows.
    merge_max_block_size_bytes = '64Mi',
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    prewarm_mark_cache = 1,
    prewarm_primary_key_cache = 1,
    enable_full_text_index = 1;

-- events_core is the lightweight, query-optimized projection of events_full
-- with truncated input/output/metadata. It is populated via the events_core_mv
-- materialized view defined below.
CREATE TABLE IF NOT EXISTS events_core ON CLUSTER default
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

    -- Ingestion attribution
    ingestion_api_key String DEFAULT '',
    ingestion_sdk_name LowCardinality(String) DEFAULT 'unknown',
    ingestion_sdk_version LowCardinality(String) DEFAULT 'unknown',

    -- Indexes
    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1,
    INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 1,
    INDEX idx_provided_model_name provided_model_name TYPE bloom_filter(0.01) GRANULARITY 2,
    INDEX idx_experiment_id experiment_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_metadata_names metadata_names TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_fts_metadata_values metadata_values TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_metadata_names metadata_names TYPE text(tokenizer = splitByNonAlpha)
)
ENGINE = ReplicatedReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    prewarm_mark_cache = 1,
    prewarm_primary_key_cache = 1,
    enable_full_text_index = 1;

-- Materialized view to populate events_core from events_full.
CREATE MATERIALIZED VIEW IF NOT EXISTS events_core_mv ON CLUSTER default TO events_core AS
SELECT
    project_id,
    trace_id,
    span_id,
    parent_span_id,
    start_time,
    end_time,
    name,
    type,
    environment,
    version,
    release,
    trace_name,
    user_id,
    session_id,
    tags,
    level,
    status_message,
    completion_start_time,
    is_app_root,
    bookmarked,
    public,
    prompt_id,
    prompt_name,
    prompt_version,
    model_id,
    provided_model_name,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    usage_pricing_tier_id,
    usage_pricing_tier_name,
    tool_definitions,
    tool_calls,
    tool_call_names,
    leftUTF8(input, 200) as input,
    leftUTF8(output, 200) as output,
    metadata_names,
    arrayMap(v -> leftUTF8(v, 200), metadata_values) as metadata_values,
    experiment_id,
    experiment_name,
    experiment_metadata_names,
    experiment_metadata_values,
    experiment_description,
    experiment_dataset_id,
    experiment_item_id,
    experiment_item_version,
    experiment_item_expected_output,
    experiment_item_metadata_names,
    experiment_item_metadata_values,
    experiment_item_root_span_id,
    source,
    service_name,
    service_version,
    scope_name,
    scope_version,
    telemetry_sdk_language,
    telemetry_sdk_name,
    telemetry_sdk_version,
    blob_storage_file_path,
    event_bytes,
    created_at,
    updated_at,
    event_ts,
    is_deleted,
    ingestion_api_key,
    ingestion_sdk_name,
    ingestion_sdk_version
FROM events_full;
