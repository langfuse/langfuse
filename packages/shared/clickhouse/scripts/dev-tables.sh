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
    CLICKHOUSE_PORT="9000"  # Default native protocol port
else
    echo "Error: Could not parse CLICKHOUSE_MIGRATION_URL: ${CLICKHOUSE_MIGRATION_URL}"
    exit 1
fi

if ! command -v clickhouse &> /dev/null
then
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
ORDER BY (
    project_id,
    toDate(s3_first_seen_timestamp),
    trace_id,
    id
);

-- Create new events table for development setups.
-- We expect this to be fully immutable and eventually replace observations.
-- See LFE-5394 for ongoing discussion.
-- Remove IF NOT EXISTS when moving this to prod migrations.
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
      metadata JSON,
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
    enable_block_offset_column = 1
    -- Try without, but re-enable if recent row performance is bad
    -- min_rows_for_wide_part = 0,
    -- min_bytes_for_wide_part = 0
  ;

EOF

echo "Populating development tables with sample data..."

clickhouse client \
  --host="${CLICKHOUSE_HOST}" \
  --port="${CLICKHOUSE_PORT}" \
  --user="${CLICKHOUSE_USER}" \
  --password="${CLICKHOUSE_PASSWORD}" \
  --database="${CLICKHOUSE_DB}" \
  --multiquery <<EOF
  TRUNCATE events;
  INSERT INTO events (project_id, trace_id, span_id, parent_span_id, start_time, end_time, name, type,
                      environment, version, release, tags, user_id, session_id, public, bookmarked, level, status_message, completion_start_time, prompt_id,
                      prompt_name, prompt_version, model_id, provided_model_name, model_parameters,
                      provided_usage_details, usage_details, provided_cost_details, cost_details, input,
                      output, metadata, metadata_names, metadata_raw_values,
                      -- metadata_string_names, metadata_string_values, metadata_number_names, metadata_number_values, metadata_bool_names, metadata_bool_values,
                      source, service_name, service_version, scope_name, scope_version, telemetry_sdk_language,
                      telemetry_sdk_name, telemetry_sdk_version, blob_storage_file_path, event_bytes,
                      created_at, updated_at, event_ts, is_deleted)
  SELECT o.project_id,
         o.trace_id,
         o.id                                                                            AS span_id,
         o.parent_observation_id                                                         AS parent_span_id,
         o.start_time,
         o.end_time,
         o.name,
         o.type,
         o.environment,
         o.version,
         t.release as release,
         t.tags as tags,
         t.user_id                                                                      AS user_id,
         t.session_id                                                                   AS session_id,
         t.public                                                                      AS public,
         t.bookmarked AND (o.parent_observation_id IS NULL OR o.parent_observation_id == '') AS bookmarked,
         o.level,
         ifNull(o.status_message, '')                                                   AS status_message,
         o.completion_start_time,
         o.prompt_id,
         o.prompt_name,
         CAST(o.prompt_version, 'Nullable(String)'),
         o.internal_model_id                                                             AS model_id,
         o.provided_model_name,
         coalesce(o.model_parameters, '{}'),
         o.provided_usage_details,
         o.usage_details,
         o.provided_cost_details,
         o.cost_details,
         ifNull(o.input, '')                                                             AS input,
         ifNull(o.output, '')                                                            AS output,
         CAST(o.metadata, 'JSON'),
         mapKeys(o.metadata)                                                             AS metadata_names,
         mapValues(o.metadata)                                                           AS metadata_raw_values,
         multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
         NULL                                                                          AS service_name,
         NULL                                                                          AS service_version,
         NULL                                                                          AS scope_name,
         NULL                                                                          AS scope_version,
         NULL                                                                          AS telemetry_sdk_language,
         NULL                                                                          AS telemetry_sdk_name,
         NULL                                                                          AS telemetry_sdk_version,
         ''                                                                            AS blob_storage_file_path,
         0                                                                             AS event_bytes,
         o.created_at,
         o.updated_at,
         o.event_ts,
         o.is_deleted
  FROM observations o
  LEFT JOIN traces t ON o.trace_id = t.id
  WHERE (o.is_deleted = 0);
EOF

echo "Development tables created successfully (or already exist)."
echo ""
