#!/bin/bash

# Development-only ClickHouse table creation script
# This script is for creating experimental/development tables that are not yet
# ready to be part of the official migration system.
#
# Usage:
#   pnpm run ch:dev-tables  (from packages/shared/)
#
# This script is automatically run as part of:
#   - pnpm run dx
#   - pnpm run dx-f
#   - pnpm run ch:reset

# Load environment variables
[ -f ../../.env ] && source ../../.env

# Check if CLICKHOUSE_MIGRATION_URL is configured
if [ -z "${CLICKHOUSE_MIGRATION_URL}" ]; then
  echo "Error: CLICKHOUSE_MIGRATION_URL is not configured."
  echo "Please set CLICKHOUSE_MIGRATION_URL in your environment variables."
  exit 1
fi

# Check if CLICKHOUSE_USER is set
if [ -z "${CLICKHOUSE_USER}" ]; then
  echo "Error: CLICKHOUSE_USER is not set."
  echo "Please set CLICKHOUSE_USER in your environment variables."
  exit 1
fi

# Check if CLICKHOUSE_PASSWORD is set
if [ -z "${CLICKHOUSE_PASSWORD}" ]; then
  echo "Error: CLICKHOUSE_PASSWORD is not set."
  echo "Please set CLICKHOUSE_PASSWORD in your environment variables."
  exit 1
fi

# Ensure CLICKHOUSE_DB is set
if [ -z "${CLICKHOUSE_DB}" ]; then
  export CLICKHOUSE_DB="default"
fi

# Parse the CLICKHOUSE_MIGRATION_URL to extract host and port
# Expected format: clickhouse://localhost:9000
if [[ $CLICKHOUSE_MIGRATION_URL =~ ^clickhouse://([^:]+):([0-9]+)$ ]]; then
  CLICKHOUSE_HOST="${BASH_REMATCH[1]}"
  CLICKHOUSE_PORT="${BASH_REMATCH[2]}"
elif [[ $CLICKHOUSE_MIGRATION_URL =~ ^clickhouse://([^:]+)$ ]]; then
  CLICKHOUSE_HOST="${BASH_REMATCH[1]}"
  CLICKHOUSE_PORT="9000" # Default native protocol port
else
  echo "Error: Could not parse CLICKHOUSE_MIGRATION_URL: ${CLICKHOUSE_MIGRATION_URL}"
  exit 1
fi

if ! command -v clickhouse &>/dev/null; then
  echo "Error: clickhouse binary could not be found. Please install ClickHouse client tools."
  exit 1
fi

echo "Creating development tables in ClickHouse..."

# Execute the CREATE TABLE statements
# Add your development tables here using CREATE TABLE IF NOT EXISTS

clickhouse client \
  --host="${CLICKHOUSE_HOST}" \
  --port="${CLICKHOUSE_PORT}" \
  --user="${CLICKHOUSE_USER}" \
  --password="${CLICKHOUSE_PASSWORD}" \
  --database="${CLICKHOUSE_DB}" \
  --multiquery <<EOF

-- Create observations_batch_staging table for batch processing
-- This table uses 3-minute partitions to efficiently process observations in batches
-- and merge them with traces data into the events table.
-- Partitions are automatically expired after 12 hours via TTL (ttl_only_drop_parts=1
-- ensures only complete partitions are dropped, not individual rows).
-- See LFE-7122 for implementation details.
CREATE TABLE IF NOT EXISTS observations_batch_staging
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
) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toStartOfInterval(s3_first_seen_timestamp, INTERVAL 3 MINUTE)
PRIMARY KEY (project_id, toDate(s3_first_seen_timestamp))
ORDER BY (
    project_id,
    toDate(s3_first_seen_timestamp),
    trace_id,
    id
)
TTL s3_first_seen_timestamp + INTERVAL 12 HOUR
SETTINGS ttl_only_drop_parts = 1;

-- Create original events table for development setups.
CREATE TABLE IF NOT EXISTS events
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
      bookmarked Bool DEFAULT false,
      public Bool DEFAULT false,

      level LowCardinality(String),
      status_message String, -- Threat '' and null the same for search
      completion_start_time Nullable(DateTime64(6)),

      -- Prompt
      prompt_id String,
      prompt_name String,
      prompt_version Nullable(UInt16),

      -- Model
      model_id String,
      provided_model_name String,
      model_parameters String,
      model_parameters_json JSON MATERIALIZED model_parameters::JSON,

      -- Usage
      provided_usage_details Map(LowCardinality(String), UInt64),
      provided_usage_details_json JSON(max_dynamic_paths=64, max_dynamic_types=8) MATERIALIZED provided_usage_details::JSON,
      usage_details Map(LowCardinality(String), UInt64),
      usage_details_json JSON(
        max_dynamic_paths=64,
        max_dynamic_types=8,
        input UInt64,
        output UInt64,
        total UInt64,
      ) MATERIALIZED usage_details::JSON,
      provided_cost_details Map(LowCardinality(String), Decimal(18,12)),
      provided_cost_details_json JSON(max_dynamic_paths=64, max_dynamic_types=8) MATERIALIZED provided_cost_details::JSON,
      cost_details Map(LowCardinality(String), Decimal(18,12)),
      cost_details_json JSON(
        max_dynamic_paths=64,
        max_dynamic_types=8,
        input Decimal(18,12),
        output Decimal(18,12),
        total Decimal(18,12),
      ) MATERIALIZED cost_details::JSON,

      calculated_input_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details))),
      calculated_output_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
      calculated_total_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0 OR positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
      total_cost Decimal(18, 12) ALIAS cost_details_json.total,
      usage_pricing_tier_id Nullable(String),
      usage_pricing_tier_name Nullable(String),

      -- Tools
      tool_definitions Map(String, String),
      tool_calls Array(String),
      tool_call_names Array(String),

      -- I/O
      input String CODEC(ZSTD(3)),
      input_truncated String MATERIALIZED leftUTF8(input, 1024),
      input_length UInt64 MATERIALIZED lengthUTF8(input),
      output String CODEC(ZSTD(3)),
      output_truncated String MATERIALIZED leftUTF8(output, 1024),
      output_length UInt64 MATERIALIZED lengthUTF8(output),

      -- Metadata
      -- Keep raw JSON to benefit from future ClickHouse improvements.
      -- For now, store things as "German Strings" with fast prefix matches based on https://www.uber.com/en-DE/blog/logging/.
      metadata JSON(max_dynamic_paths=0),
      metadata_names Array(String),
      metadata_raw_values Array(String), -- should not be used on retrieval, only for materializing other columns
      metadata_prefixes Array(String) MATERIALIZED arrayMap(v -> leftUTF8(CAST(v, 'String'), 200), metadata_raw_values),
      metadata_hashes Array(Nullable(UInt32)) MATERIALIZED arrayMap(v -> if(lengthUTF8(CAST(v, 'String')) > 200, xxHash32(CAST(v, 'String')), NULL), metadata_raw_values),
      metadata_long_values Map(UInt32, String) MATERIALIZED mapFromArrays(
        arrayMap(v -> xxHash32(CAST(v, 'String')), arrayFilter(v -> lengthUTF8(CAST(v, 'String')) > 200, metadata_raw_values)),
        arrayMap(v -> CAST(v, 'String'), arrayFilter(v -> lengthUTF8(CAST(v, 'String')) > 200, metadata_raw_values))
      ),

      -- Experiment properties
      experiment_id String,
      experiment_name String,
      experiment_metadata_names Array(String),
      experiment_metadata_values Array(String), -- We will restrict this to 200 characters on the client.
      experiment_description String,
      experiment_dataset_id String,
      experiment_item_id String,
      experiment_item_version Nullable(DateTime64(6)),
      experiment_item_expected_output String,
      experiment_item_metadata_names Array(String),
      experiment_item_metadata_values Array(String), -- We will restrict this to 200 characters on the client.
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
      INDEX idx_type type TYPE set(50) GRANULARITY 1,
      INDEX idx_created_at created_at TYPE minmax GRANULARITY 1,
      INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 1,

      -- Full Text Search Indexes (We should try different index sizes, e.g. 2048, 4096, or 8192)
      -- Add after backfill as they limit backfill throughput performance
      -- INDEX idx_fts_input_1 input TYPE ngrambf_v1(1, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_input_2 input TYPE ngrambf_v1(2, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_input_4 input TYPE ngrambf_v1(4, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_input_8 input TYPE ngrambf_v1(8, 1024, 1, 0) GRANULARITY 1,

      -- INDEX idx_fts_output_1 output TYPE ngrambf_v1(1, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_output_2 output TYPE ngrambf_v1(2, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_output_4 output TYPE ngrambf_v1(4, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_output_8 output TYPE ngrambf_v1(8, 1024, 1, 0) GRANULARITY 1,
  )
  ENGINE = ReplacingMergeTree(event_ts, is_deleted)
  -- ENGINE = (Replicated)ReplacingMergeTree(event_ts, is_deleted)
  PARTITION BY toYYYYMM(start_time)
  PRIMARY KEY (project_id, start_time, xxHash32(trace_id))
  ORDER BY (project_id, start_time, xxHash32(trace_id), span_id)
  SAMPLE BY xxHash32(trace_id)
  SETTINGS
    index_granularity = 8192,
    index_granularity_bytes = '64Mi', -- Default 10MiB. Avoid small granules due to large rows.
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    dynamic_serialization_version='v3',
    object_serialization_version='v3',
    object_shared_data_serialization_version='advanced',
    object_shared_data_serialization_version_for_zero_level_parts='map_with_buckets'
    -- Try without, but re-enable if recent row performance is bad
    -- min_rows_for_wide_part = 0,
    -- min_bytes_for_wide_part = 0
  ;

-- Create new events table for development setups.
-- We expect this to be fully immutable and eventually replace observations.
-- Remove IF NOT EXISTS when moving this to prod migrations.
CREATE TABLE IF NOT EXISTS events_full
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
      status_message String, -- Threat '' and null the same for search
      completion_start_time Nullable(DateTime64(6)),

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
      experiment_metadata_values Array(String), -- We will restrict this to 200 characters on the client.
      experiment_description String,
      experiment_dataset_id String,
      experiment_item_id String,
      experiment_item_version Nullable(DateTime64(6)),
      experiment_item_expected_output String,
      experiment_item_metadata_names Array(String),
      experiment_item_metadata_values Array(String), -- We will restrict this to 200 characters on the client.
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

      -- Full Text Search Indexes (We should try different index sizes, e.g. 2048, 4096, or 8192)
      -- Add after backfill as they limit backfill throughput performance
      -- INDEX idx_fts_input_1 input TYPE ngrambf_v1(1, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_input_2 input TYPE ngrambf_v1(2, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_input_4 input TYPE ngrambf_v1(4, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_input_8 input TYPE ngrambf_v1(8, 1024, 1, 0) GRANULARITY 1,

      -- INDEX idx_fts_output_1 output TYPE ngrambf_v1(1, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_output_2 output TYPE ngrambf_v1(2, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_output_4 output TYPE ngrambf_v1(4, 1024, 1, 0) GRANULARITY 1,
      -- INDEX idx_fts_output_8 output TYPE ngrambf_v1(8, 1024, 1, 0) GRANULARITY 1,
  )
  ENGINE = ReplacingMergeTree(event_ts, is_deleted)
  -- ENGINE = (Replicated)ReplacingMergeTree(event_ts, is_deleted)
  PARTITION BY toYYYYMM(start_time)
  PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
  ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
  SAMPLE BY xxHash32(trace_id)
  SETTINGS
    index_granularity_bytes = '64Mi', -- Default 10MiB. Avoid small granules due to large rows.
    merge_max_block_size_bytes = '64Mi',
    enable_block_number_column = 1,
    enable_block_offset_column = 1
  ;

-- Create events_core table - lightweight version with truncated input/output/metadata for fast queries
-- This table is populated via materialized view from the events_full table.
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
    INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 1
)
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS
    enable_block_number_column = 1,
    enable_block_offset_column = 1;

-- Materialized view to populate events_core from events_full table
CREATE MATERIALIZED VIEW IF NOT EXISTS events_core_mv TO events_core AS
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
    is_deleted
FROM events_full;

CREATE MATERIALIZED VIEW IF NOT EXISTS events_full_mv TO events_full AS
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
    input,
    output,
    metadata_names,
    metadata_raw_values as metadata_values,
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
    is_deleted
FROM events;

EOF

echo "Populating development tables with sample data..."

clickhouse client \
  --host="${CLICKHOUSE_HOST}" \
  --port="${CLICKHOUSE_PORT}" \
  --user="${CLICKHOUSE_USER}" \
  --password="${CLICKHOUSE_PASSWORD}" \
  --database="${CLICKHOUSE_DB}" \
  --multiquery <<EOF
  SET type_json_skip_duplicated_paths = 1;
  TRUNCATE events;
  TRUNCATE events_core;
  TRUNCATE events_full;

  -- Note: production excludes experiment traces here (LEFT ANTI JOIN dataset_run_items_rmt)
  -- and re-inserts them with experiment metadata via handleExperimentBackfill.
  -- For dev seeding, we include all traces directly to ensure events_core and
  -- traces/observations tables have matching row counts for dashboard testing.
  INSERT INTO events (project_id, trace_id, span_id, parent_span_id, start_time, end_time, name, type,
                      environment, version, release, tags, trace_name, user_id, session_id, public, bookmarked, level, status_message, completion_start_time, prompt_id,
                      prompt_name, prompt_version, model_id, provided_model_name, model_parameters,
                      provided_usage_details, usage_details, provided_cost_details, cost_details,
                      usage_pricing_tier_id, usage_pricing_tier_name,
                      tool_definitions, tool_calls, tool_call_names, input,
                      output, metadata, metadata_names, metadata_raw_values,
                      source, blob_storage_file_path, event_bytes,
                      created_at, updated_at, event_ts, is_deleted)
  SELECT o.project_id,
         o.trace_id,
         o.id                                                                            AS span_id,
         CASE
           WHEN o.id = concat('t-', o.trace_id) THEN ''
           ELSE coalesce(o.parent_observation_id, concat('t-', o.trace_id))
         END                                                                             AS parent_span_id,
         o.start_time,
         o.end_time,
         o.name,
         o.type,
         o.environment,
         coalesce(o.version, t.version)                                                  AS version,
         coalesce(t.release, '')                                                         AS release,
         t.tags                                                                          AS tags,
         t.name                                                                          AS trace_name,
         coalesce(t.user_id, '')                                                         AS user_id,
         coalesce(t.session_id, '')                                                      AS session_id,
         t.public                                                                        AS public,
         t.bookmarked AND (o.parent_observation_id IS NULL OR o.parent_observation_id = '') AS bookmarked,
         o.level,
         coalesce(o.status_message, '')                                                  AS status_message,
         o.completion_start_time,
         o.prompt_id,
         o.prompt_name,
         o.prompt_version,
         o.internal_model_id                                                             AS model_id,
         o.provided_model_name,
         coalesce(o.model_parameters, '{}'),
         o.provided_usage_details,
         o.usage_details,
         o.provided_cost_details,
         o.cost_details,
         o.usage_pricing_tier_id,
         o.usage_pricing_tier_name,
         o.tool_definitions,
         o.tool_calls,
         o.tool_call_names,
         coalesce(o.input, '')                                                           AS input,
         coalesce(o.output, '')                                                          AS output,
         CAST(mapConcat(o.metadata, coalesce(t.metadata, map())), 'JSON(max_dynamic_paths=0)') AS metadata,
         mapKeys(mapConcat(o.metadata, coalesce(t.metadata, map())))                     AS metadata_names,
         mapValues(mapConcat(o.metadata, coalesce(t.metadata, map())))                   AS metadata_raw_values,
         multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel-dual-write', 'ingestion-api-dual-write') AS source,
         ''                                                                              AS blob_storage_file_path,
         byteSize(*)                                                                     AS event_bytes,
         o.created_at,
         o.updated_at,
         o.event_ts,
         o.is_deleted
  FROM observations o FINAL
  LEFT JOIN traces t ON o.project_id = t.project_id AND o.trace_id = t.id
  WHERE (o.is_deleted = 0);
  -- Backfill events from traces table as well
  -- Traces are converted to synthetic observations with id = 't-' + trace_id
  -- (matching convertTraceToStagingObservation in the ingestion pipeline)
  INSERT INTO events (project_id, trace_id, span_id, parent_span_id, start_time, name, type,
                      environment, version, release, tags, trace_name, user_id, session_id, public, bookmarked, level,
                      model_parameters, provided_usage_details, usage_details, provided_cost_details, cost_details,
                      usage_pricing_tier_id, usage_pricing_tier_name,
                      tool_definitions, tool_calls, tool_call_names,
                      input, output,
                      metadata, metadata_names, metadata_raw_values,
                      source, blob_storage_file_path, event_bytes,
                      created_at, updated_at, event_ts, is_deleted)
  SELECT t.project_id,
         t.id,
         concat('t-', t.id)                                                              AS span_id,
         ''                                                                               AS parent_span_id,
         t.timestamp,
         t.name,
         'SPAN',
         t.environment,
         t.version,
         coalesce(t.release, '')                                                         AS release,
         t.tags                                                                          AS tags,
         t.name                                                                          AS trace_name,
         coalesce(t.user_id, '')                                                         AS user_id,
         coalesce(t.session_id, '')                                                      AS session_id,
         t.public                                                                        AS public,
         t.bookmarked                                                                    AS bookmarked,
         'DEFAULT'                                                                       AS level,
         '{}'                                                                            AS model_parameters,
         map(),
         map(),
         map(),
         map(),
         NULL,
         NULL,
         map(),
         [],
         [],
         coalesce(t.input, '')                                                           AS input,
         coalesce(t.output, '')                                                          AS output,
         CAST(t.metadata, 'JSON(max_dynamic_paths=0)'),
         mapKeys(t.metadata)                                                             AS metadata_names,
         mapValues(t.metadata)                                                           AS metadata_raw_values,
         multiIf(mapContains(t.metadata, 'resourceAttributes'), 'otel-dual-write', 'ingestion-api-dual-write') AS source,
         ''                                                                              AS blob_storage_file_path,
         byteSize(*)                                                                     AS event_bytes,
         t.created_at,
         t.updated_at,
         t.event_ts,
         t.is_deleted
  FROM traces t FINAL
  WHERE (t.is_deleted = 0);

EOF

echo "Development tables created successfully (or already exist)."
echo ""
