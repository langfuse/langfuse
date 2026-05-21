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

-- The observations_batch_staging definition has been promoted to production
-- CH migrations:
--   packages/shared/clickhouse/migrations/{clustered,unclustered}/0038_add_observations_batch_staging_table.up.sql
-- Do not duplicate the DDL here.

-- The events_full + events_core + events_core_mv definitions have been promoted
-- to production CH migrations:
--   packages/shared/clickhouse/migrations/{clustered,unclustered}/0035_add_events_full_table.up.sql
--   packages/shared/clickhouse/migrations/{clustered,unclustered}/0036_add_events_core_table.up.sql
--   packages/shared/clickhouse/migrations/{clustered,unclustered}/0037_add_events_core_mv.up.sql
-- Do not duplicate the DDL here.

-- Diagnostic table to track event size distributions across projects.
-- Every insert (including updates) produces a row — no deduplication.
-- See LFE-9402 for context.
CREATE TABLE IF NOT EXISTS ingestion_size_stats (
    project_id String,
    trace_id String,
    span_id String,
    created_at DateTime64(3),
    input_size UInt64,
    output_size UInt64,
    metadata_size UInt64,
    total_size UInt64
) ENGINE = MergeTree
PRIMARY KEY (toStartOfHour(created_at), project_id)
ORDER BY (toStartOfHour(created_at), project_id, trace_id, span_id, created_at);

-- MV: observations -> ingestion_size_stats
CREATE MATERIALIZED VIEW IF NOT EXISTS ingestion_size_stats_observations_mv
TO ingestion_size_stats AS
SELECT
    project_id,
    trace_id,
    id AS span_id,
    created_at,
    length(coalesce(input, '')) AS input_size,
    length(coalesce(output, '')) AS output_size,
    arraySum(arrayMap(k -> length(k), mapKeys(metadata)))
      + arraySum(arrayMap(v -> length(v), mapValues(metadata))) AS metadata_size,
    byteSize(*) AS total_size
FROM observations;

-- MV: traces -> ingestion_size_stats
CREATE MATERIALIZED VIEW IF NOT EXISTS ingestion_size_stats_traces_mv
TO ingestion_size_stats AS
SELECT
    project_id,
    id AS trace_id,
    concat('t-', id) AS span_id,
    created_at,
    length(coalesce(input, '')) AS input_size,
    length(coalesce(output, '')) AS output_size,
    arraySum(arrayMap(k -> length(k), mapKeys(metadata)))
      + arraySum(arrayMap(v -> length(v), mapValues(metadata))) AS metadata_size,
    byteSize(*) AS total_size
FROM traces;

CREATE VIEW analytics_events_core AS
SELECT
  project_id,
  toStartOfHour(start_time) AS hour,
  sumMap(map(type, toUInt64(1))) AS count_types,
  uniq(trace_id) AS count_traces,
  uniq(span_id) AS count_spans,
  uniqIf(trace_name, trace_name != '') AS count_trace_names,
  max(user_id != '') AS has_users,
  uniqIf(user_id, user_id != '') AS count_users,
  max(session_id != '') AS has_sessions,
  uniqIf(session_id, session_id != '') AS count_sessions,
  max(if(environment != 'default', 1, 0)) AS has_environments,
  uniq(environment) as count_environments,
  max(length(tags) > 0) AS has_tags,
  uniqArray(tags) AS count_unique_tags,
  max(level != 'DEFAULT') AS has_level,
  max(provided_model_name != '') AS has_provided_model_name,
  uniqIf(provided_model_name, provided_model_name != '') AS count_models,
  max(length(provided_usage_details) > 0) AS has_provided_usage_details,
  max(length(provided_cost_details) > 0) AS has_provided_cost_details,
  max(prompt_name != '') AS has_prompt_name,
  max(length(tool_definitions) > 0) AS has_tool_definitions,
  max(length(tool_calls) > 0) AS has_tool_calls,
  uniqArray(metadata_names) AS count_unique_metadata_names,
  max(experiment_name != '') AS has_experiment_names,
  uniqIf(experiment_name, experiment_name != '') AS count_unique_experiment_names,
  sum(event_bytes) AS sum_event_bytes,
  sumMap(map(if(source = '', '-', source), toUInt64(1))) AS count_sources,
  uniqIf(service_name, service_name != '') as count_service_names,
  sumMap(map(if(scope_name = '', '-', concat(scope_name, '-', scope_version)), toUInt64(1))) AS count_scopes,
  sumMap(map(if(telemetry_sdk_language = '', '-', telemetry_sdk_language), toUInt64(1))) AS count_telemetry_sdk_languages,
  sumMap(map(if(telemetry_sdk_name = '', '-', concat(telemetry_sdk_language, '-', telemetry_sdk_name, '-', telemetry_sdk_version)), toUInt64(1))) AS count_sdk_telemetry_sdks
FROM events_core
WHERE toStartOfHour(start_time) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY project_id, hour;

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
  TRUNCATE events_core;
  TRUNCATE events_full;

  -- Insert observations into events_full (experiment metadata included when dataset_run_items match)
  INSERT INTO events_full (project_id, trace_id, span_id, parent_span_id, start_time, end_time, name, type,
                      environment, version, release, tags, trace_name, user_id, session_id, public, bookmarked, level, status_message, completion_start_time, prompt_id,
                      prompt_name, prompt_version, model_id, provided_model_name, model_parameters,
                      provided_usage_details, usage_details, provided_cost_details, cost_details,
                      usage_pricing_tier_id, usage_pricing_tier_name,
                      tool_definitions, tool_calls, tool_call_names, input,
                      output, metadata_names, metadata_values,
                      experiment_id, experiment_name, experiment_description, experiment_dataset_id,
                      experiment_item_id, experiment_item_expected_output,
                      experiment_metadata_names, experiment_metadata_values,
                      experiment_item_metadata_names, experiment_item_metadata_values,
                      experiment_item_root_span_id,
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
         mapKeys(mapConcat(o.metadata, coalesce(t.metadata, map())))                     AS metadata_names,
         mapValues(mapConcat(o.metadata, coalesce(t.metadata, map())))                   AS metadata_values,
         coalesce(dri.dataset_run_id, '')                                                AS experiment_id,
         coalesce(dri.dataset_run_name, '')                                              AS experiment_name,
         coalesce(dri.dataset_run_description, '')                                       AS experiment_description,
         coalesce(dri.dataset_id, '')                                                    AS experiment_dataset_id,
         coalesce(dri.dataset_item_id, '')                                               AS experiment_item_id,
         coalesce(dri.dataset_item_expected_output, '')                                  AS experiment_item_expected_output,
         if(dri.dataset_run_id != '', mapKeys(dri.dataset_run_metadata), [])             AS experiment_metadata_names,
         if(dri.dataset_run_id != '', mapValues(dri.dataset_run_metadata), [])           AS experiment_metadata_values,
         if(dri.dataset_run_id != '', mapKeys(dri.dataset_item_metadata), [])            AS experiment_item_metadata_names,
         if(dri.dataset_run_id != '', mapValues(dri.dataset_item_metadata), [])          AS experiment_item_metadata_values,
         if(dri.dataset_run_id != '', o.id, '')                                          AS experiment_item_root_span_id,
         multiIf(dri.dataset_run_id != '', 'ingestion-api-dual-write-experiments', mapContains(o.metadata, 'resourceAttributes'), 'otel-dual-write', 'ingestion-api-dual-write') AS source,
         ''                                                                              AS blob_storage_file_path,
         byteSize(*)                                                                     AS event_bytes,
         o.created_at,
         o.updated_at,
         o.event_ts,
         o.is_deleted
  FROM observations o FINAL
  LEFT JOIN traces t ON o.project_id = t.project_id AND o.trace_id = t.id
  LEFT JOIN dataset_run_items_rmt dri ON o.project_id = dri.project_id AND o.trace_id = dri.trace_id
  WHERE (o.is_deleted = 0);

  -- Backfill events from traces table as well (experiment metadata included when dataset_run_items match)
  -- Traces are converted to synthetic observations with id = 't-' + trace_id
  -- (matching convertTraceToStagingObservation in the ingestion pipeline)
  INSERT INTO events_full (project_id, trace_id, span_id, parent_span_id, start_time, name, type,
                      environment, version, release, tags, trace_name, user_id, session_id, public, bookmarked, level,
                      model_parameters, provided_usage_details, usage_details, provided_cost_details, cost_details,
                      usage_pricing_tier_id, usage_pricing_tier_name,
                      tool_definitions, tool_calls, tool_call_names,
                      input, output,
                      metadata_names, metadata_values,
                      experiment_id, experiment_name, experiment_description, experiment_dataset_id,
                      experiment_item_id, experiment_item_expected_output,
                      experiment_metadata_names, experiment_metadata_values,
                      experiment_item_metadata_names, experiment_item_metadata_values,
                      experiment_item_root_span_id,
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
         mapKeys(t.metadata)                                                             AS metadata_names,
         mapValues(t.metadata)                                                           AS metadata_values,
         coalesce(dri.dataset_run_id, '')                                                AS experiment_id,
         coalesce(dri.dataset_run_name, '')                                              AS experiment_name,
         coalesce(dri.dataset_run_description, '')                                       AS experiment_description,
         coalesce(dri.dataset_id, '')                                                    AS experiment_dataset_id,
         coalesce(dri.dataset_item_id, '')                                               AS experiment_item_id,
         coalesce(dri.dataset_item_expected_output, '')                                  AS experiment_item_expected_output,
         if(dri.dataset_run_id != '', mapKeys(dri.dataset_run_metadata), [])             AS experiment_metadata_names,
         if(dri.dataset_run_id != '', mapValues(dri.dataset_run_metadata), [])           AS experiment_metadata_values,
         if(dri.dataset_run_id != '', mapKeys(dri.dataset_item_metadata), [])            AS experiment_item_metadata_names,
         if(dri.dataset_run_id != '', mapValues(dri.dataset_item_metadata), [])          AS experiment_item_metadata_values,
         if(dri.dataset_run_id != '', concat('t-', t.id), '')                            AS experiment_item_root_span_id,
         multiIf(dri.dataset_run_id != '', 'ingestion-api-dual-write-experiments', mapContains(t.metadata, 'resourceAttributes'), 'otel-dual-write', 'ingestion-api-dual-write') AS source,
         ''                                                                              AS blob_storage_file_path,
         byteSize(*)                                                                     AS event_bytes,
         t.created_at,
         t.updated_at,
         t.event_ts,
         t.is_deleted
  FROM traces t FINAL
  LEFT JOIN dataset_run_items_rmt dri ON t.project_id = dri.project_id AND t.id = dri.trace_id
  WHERE (t.is_deleted = 0);

EOF

echo "Development tables created successfully (or already exist)."
echo ""
