SELECT throwIf(
    count() > 0,
    'Sharded migrations require an empty database and never convert existing Langfuse tables'
)
FROM system.tables
WHERE database = currentDatabase()
  AND name IN (
    'traces', 'traces_local',
    'observations', 'observations_local',
    'scores', 'scores_local',
    'observations_batch_staging', 'observations_batch_staging_local',
    'events_full', 'events_full_local',
    'events_core', 'events_core_local',
    'dataset_run_items', 'dataset_run_items_rmt', 'dataset_run_items_rmt_local',
    'blob_storage_file_log', 'blob_storage_file_log_local',
    'event_log',
    'ingestion_size_stats', 'ingestion_size_stats_local',
    'project_environments', 'project_environments_local'
  );

CREATE TABLE traces_local ON CLUSTER default
(
    `id` String,
    `timestamp` DateTime64(3),
    `name` String,
    `user_id` Nullable(String),
    `metadata` Map(LowCardinality(String), String),
    `release` Nullable(String),
    `version` Nullable(String),
    `project_id` String,
    `environment` LowCardinality(String) DEFAULT 'default',
    `public` Bool,
    `bookmarked` Bool,
    `tags` Array(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `session_id` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/traces',
    '{replica}',
    event_ts,
    is_deleted
)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (project_id, toDate(timestamp))
ORDER BY (project_id, toDate(timestamp), id)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE traces ON CLUSTER default AS traces_local
ENGINE = Distributed(default, currentDatabase(), traces_local, cityHash64(project_id, id))
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE observations_local ON CLUSTER default
(
    `id` String,
    `trace_id` String,
    `project_id` String,
    `environment` LowCardinality(String) DEFAULT 'default',
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `name` String,
    `metadata` Map(LowCardinality(String), String),
    `level` LowCardinality(String),
    `status_message` Nullable(String),
    `version` Nullable(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `provided_model_name` Nullable(String),
    `internal_model_id` Nullable(String),
    `model_parameters` Nullable(String),
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal(18, 12)),
    `cost_details` Map(LowCardinality(String), Decimal(18, 12)),
    `total_cost` Nullable(Decimal(18, 12)),
    `completion_start_time` Nullable(DateTime64(3)),
    `prompt_id` Nullable(String),
    `prompt_name` Nullable(String),
    `prompt_version` Nullable(UInt16),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    `usage_pricing_tier_id` Nullable(String),
    `usage_pricing_tier_name` Nullable(String),
    `tool_definitions` Map(String, String) DEFAULT map(),
    `tool_calls` Array(String) DEFAULT [],
    `tool_call_names` Array(String) DEFAULT [],
    INDEX idx_id id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter() GRANULARITY 1,
    INDEX idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/observations',
    '{replica}',
    event_ts,
    is_deleted
)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, type, toDate(start_time))
ORDER BY (project_id, type, toDate(start_time), id)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE observations ON CLUSTER default AS observations_local
ENGINE = Distributed(default, currentDatabase(), observations_local, cityHash64(project_id, trace_id))
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE scores_local ON CLUSTER default
(
    `id` String,
    `timestamp` DateTime64(3),
    `project_id` String,
    `environment` LowCardinality(String) DEFAULT 'default',
    `trace_id` Nullable(String),
    `session_id` Nullable(String),
    `dataset_run_id` Nullable(String),
    `observation_id` Nullable(String),
    `name` String,
    `value` Float64,
    `source` String,
    `comment` Nullable(String) CODEC(ZSTD(1)),
    `metadata` Map(LowCardinality(String), String),
    `author_user_id` Nullable(String),
    `config_id` Nullable(String),
    `data_type` String,
    `string_value` Nullable(String),
    `queue_id` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    `execution_trace_id` Nullable(String),
    `long_string_value` String CODEC(ZSTD(3)),
    `ingestion_api_key` String DEFAULT '',
    `ingestion_sdk_name` LowCardinality(String) DEFAULT 'unknown',
    `ingestion_sdk_version` LowCardinality(String) DEFAULT 'unknown',
    INDEX idx_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_trace_observation (project_id, trace_id, observation_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_session (project_id, session_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_project_dataset_run (project_id, dataset_run_id) TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/scores',
    '{replica}',
    event_ts,
    is_deleted
)
PARTITION BY toYYYYMM(timestamp)
PRIMARY KEY (project_id, toDate(timestamp), name)
ORDER BY (project_id, toDate(timestamp), name, id)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE scores ON CLUSTER default AS scores_local
ENGINE = Distributed(
    default,
    currentDatabase(),
    scores_local,
    cityHash64(project_id, ifNull(trace_id, id))
)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE observations_batch_staging_local ON CLUSTER default
(
    `id` String,
    `trace_id` String,
    `project_id` String,
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `name` String,
    `metadata` Map(LowCardinality(String), String),
    `level` LowCardinality(String),
    `status_message` Nullable(String),
    `version` Nullable(String),
    `input` Nullable(String) CODEC(ZSTD(3)),
    `output` Nullable(String) CODEC(ZSTD(3)),
    `provided_model_name` Nullable(String),
    `internal_model_id` Nullable(String),
    `model_parameters` Nullable(String),
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal(18, 12)),
    `cost_details` Map(LowCardinality(String), Decimal(18, 12)),
    `total_cost` Nullable(Decimal(18, 12)),
    `usage_pricing_tier_id` Nullable(String),
    `usage_pricing_tier_name` Nullable(String),
    `tool_definitions` Map(String, String),
    `tool_calls` Array(String),
    `tool_call_names` Array(String),
    `completion_start_time` Nullable(DateTime64(3)),
    `prompt_id` Nullable(String),
    `prompt_name` Nullable(String),
    `prompt_version` Nullable(UInt16),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    `s3_first_seen_timestamp` DateTime64(3),
    `environment` LowCardinality(String) DEFAULT 'default',
    `ingestion_api_key` String DEFAULT '',
    `ingestion_sdk_name` LowCardinality(String) DEFAULT 'unknown',
    `ingestion_sdk_version` LowCardinality(String) DEFAULT 'unknown'
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/observations_batch_staging',
    '{replica}',
    event_ts,
    is_deleted
)
PARTITION BY toStartOfInterval(s3_first_seen_timestamp, INTERVAL 3 MINUTE)
PRIMARY KEY (project_id, toDate(s3_first_seen_timestamp))
ORDER BY (project_id, toDate(s3_first_seen_timestamp), trace_id, id)
TTL s3_first_seen_timestamp + INTERVAL 48 HOUR
SETTINGS ttl_only_drop_parts = 1
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE observations_batch_staging ON CLUSTER default AS observations_batch_staging_local
ENGINE = Distributed(
    default,
    currentDatabase(),
    observations_batch_staging_local,
    cityHash64(project_id, trace_id)
)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE dataset_run_items_rmt_local ON CLUSTER default
(
    `id` String,
    `project_id` String,
    `dataset_run_id` String,
    `dataset_item_id` String,
    `dataset_id` String,
    `trace_id` String,
    `observation_id` Nullable(String),
    `error` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `dataset_run_name` String,
    `dataset_run_description` Nullable(String),
    `dataset_run_metadata` Map(LowCardinality(String), String),
    `dataset_run_created_at` DateTime64(3),
    `dataset_item_input` Nullable(String) CODEC(ZSTD(3)),
    `dataset_item_expected_output` Nullable(String) CODEC(ZSTD(3)),
    `dataset_item_metadata` Map(LowCardinality(String), String),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    `dataset_item_version` Nullable(DateTime64(3)),
    INDEX idx_dataset_item dataset_item_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/dataset_run_items_rmt',
    '{replica}',
    event_ts,
    is_deleted
)
ORDER BY (project_id, dataset_id, dataset_run_id, id)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE dataset_run_items_rmt ON CLUSTER default AS dataset_run_items_rmt_local
ENGINE = Distributed(
    default,
    currentDatabase(),
    dataset_run_items_rmt_local,
    cityHash64(project_id, trace_id)
)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE blob_storage_file_log_local ON CLUSTER default
(
    `id` String,
    `project_id` String,
    `entity_type` String,
    `entity_id` String,
    `event_id` String,
    `bucket_name` String,
    `bucket_path` String,
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/blob_storage_file_log',
    '{replica}',
    event_ts,
    is_deleted
)
ORDER BY (project_id, entity_type, entity_id, event_id)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE blob_storage_file_log ON CLUSTER default AS blob_storage_file_log_local
ENGINE = Distributed(
    default,
    currentDatabase(),
    blob_storage_file_log_local,
    cityHash64(project_id, entity_id)
)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE events_full_local ON CLUSTER default
(
    `project_id` String,
    `trace_id` String,
    `span_id` String,
    `parent_span_id` String,
    `start_time` DateTime64(6),
    `end_time` Nullable(DateTime64(6)),
    `name` String,
    `type` LowCardinality(String),
    `environment` LowCardinality(String) DEFAULT 'default',
    `version` String,
    `release` String,
    `trace_name` String,
    `user_id` String,
    `session_id` String,
    `tags` Array(String),
    `level` LowCardinality(String),
    `status_message` String,
    `completion_start_time` Nullable(DateTime64(6)),
    `is_app_root` Bool DEFAULT false,
    `bookmarked` Bool DEFAULT false,
    `public` Bool DEFAULT false,
    `prompt_id` String,
    `prompt_name` String,
    `prompt_version` Nullable(UInt16),
    `model_id` String,
    `provided_model_name` String,
    `model_parameters` String,
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal(18, 12)),
    `cost_details` Map(LowCardinality(String), Decimal(18, 12)),
    `calculated_input_cost` Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details))),
    `calculated_output_cost` Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
    `calculated_total_cost` Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0 OR positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
    `total_cost` Decimal(18, 12) ALIAS cost_details['total'],
    `usage_pricing_tier_id` Nullable(String),
    `usage_pricing_tier_name` Nullable(String),
    `tool_definitions` Map(String, String),
    `tool_calls` Array(String),
    `tool_call_names` Array(String),
    `input` String CODEC(ZSTD(3)),
    `input_length` UInt64 MATERIALIZED lengthUTF8(input),
    `output` String CODEC(ZSTD(3)),
    `output_length` UInt64 MATERIALIZED lengthUTF8(output),
    `metadata_names` Array(String),
    `metadata_values` Array(String),
    `experiment_id` String,
    `experiment_name` String,
    `experiment_metadata_names` Array(String),
    `experiment_metadata_values` Array(String),
    `experiment_description` String,
    `experiment_dataset_id` String,
    `experiment_item_id` String,
    `experiment_item_version` Nullable(DateTime64(6)),
    `experiment_item_expected_output` String,
    `experiment_item_metadata_names` Array(String),
    `experiment_item_metadata_values` Array(String),
    `experiment_item_root_span_id` String,
    `source` LowCardinality(String),
    `service_name` String,
    `service_version` String,
    `scope_name` String,
    `scope_version` String,
    `telemetry_sdk_language` LowCardinality(String),
    `telemetry_sdk_name` String,
    `telemetry_sdk_version` String,
    `blob_storage_file_path` String,
    `event_bytes` UInt64,
    `created_at` DateTime64(6) DEFAULT now(),
    `updated_at` DateTime64(6) DEFAULT now(),
    `event_ts` DateTime64(6),
    `is_deleted` UInt8,
    `ingestion_api_key` String DEFAULT '',
    `ingestion_sdk_name` LowCardinality(String) DEFAULT 'unknown',
    `ingestion_sdk_version` LowCardinality(String) DEFAULT 'unknown',
    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_created_at created_at TYPE minmax GRANULARITY 1,
    INDEX idx_updated_at updated_at TYPE minmax GRANULARITY 1,
    INDEX idx_fts_input_low lower(input) TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_output_low lower(output) TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_metadata_values metadata_values TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_metadata_names metadata_names TYPE text(tokenizer = splitByNonAlpha),
    INDEX idx_fts_metadata_values_ngram arrayStringConcat(metadata_values) TYPE ngrambf_v1(4, 32000, 3, 0) GRANULARITY 2
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/events_full',
    '{replica}',
    event_ts,
    is_deleted
)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS
    index_granularity_bytes = '64Mi',
    merge_max_block_size_bytes = '64Mi',
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    prewarm_mark_cache = 1,
    prewarm_primary_key_cache = 1,
    enable_full_text_index = 1
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE events_full ON CLUSTER default AS events_full_local
ENGINE = Distributed(default, currentDatabase(), events_full_local, cityHash64(project_id, trace_id))
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE events_core_local ON CLUSTER default AS events_full_local
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/events_core',
    '{replica}',
    event_ts,
    is_deleted
)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    prewarm_mark_cache = 1,
    prewarm_primary_key_cache = 1,
    enable_full_text_index = 1
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE events_core ON CLUSTER default AS events_core_local
ENGINE = Distributed(default, currentDatabase(), events_core_local, cityHash64(project_id, trace_id))
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE MATERIALIZED VIEW events_core_mv ON CLUSTER default TO events_core_local AS
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
    leftUTF8(input, 200) AS input,
    leftUTF8(output, 200) AS output,
    metadata_names,
    arrayMap(value -> leftUTF8(value, 200), metadata_values) AS metadata_values,
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
FROM events_full_local;

CREATE TABLE ingestion_size_stats_local ON CLUSTER default
(
    `project_id` String,
    `trace_id` String,
    `span_id` String,
    `created_at` DateTime64(3),
    `input_size` UInt64,
    `output_size` UInt64,
    `metadata_size` UInt64,
    `total_size` UInt64
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/ingestion_size_stats',
    '{replica}'
)
PRIMARY KEY (toStartOfHour(created_at), project_id)
ORDER BY (toStartOfHour(created_at), project_id, trace_id, span_id, created_at)
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE ingestion_size_stats ON CLUSTER default AS ingestion_size_stats_local
ENGINE = Distributed(default, currentDatabase(), ingestion_size_stats_local, cityHash64(project_id, trace_id))
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE MATERIALIZED VIEW ingestion_size_stats_observations_mv ON CLUSTER default
TO ingestion_size_stats_local AS
SELECT
    project_id,
    trace_id,
    id AS span_id,
    created_at,
    length(coalesce(input, '')) AS input_size,
    length(coalesce(output, '')) AS output_size,
    arraySum(arrayMap(key -> length(key), mapKeys(metadata)))
      + arraySum(arrayMap(value -> length(value), mapValues(metadata))) AS metadata_size,
    byteSize(*) AS total_size
FROM observations_local;

CREATE MATERIALIZED VIEW ingestion_size_stats_traces_mv ON CLUSTER default
TO ingestion_size_stats_local AS
SELECT
    project_id,
    id AS trace_id,
    concat('t-', id) AS span_id,
    created_at,
    length(coalesce(input, '')) AS input_size,
    length(coalesce(output, '')) AS output_size,
    arraySum(arrayMap(key -> length(key), mapKeys(metadata)))
      + arraySum(arrayMap(value -> length(value), mapValues(metadata))) AS metadata_size,
    byteSize(*) AS total_size
FROM traces_local;

CREATE TABLE project_environments_local ON CLUSTER default
(
    `project_id` String,
    `environments` SimpleAggregateFunction(groupUniqArrayArray, Array(String))
)
ENGINE = ReplicatedAggregatingMergeTree(
    '/clickhouse/tables/{shard}/project_environments',
    '{replica}'
)
ORDER BY project_id
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE project_environments ON CLUSTER default AS project_environments_local
ENGINE = Distributed(default, currentDatabase(), project_environments_local, cityHash64(project_id))
COMMENT 'langfuse_sharding_schema=1,langfuse_routing=1';

CREATE TABLE dataset_run_items ON CLUSTER default
(
    `id` String,
    `project_id` String,
    `dataset_run_id` String,
    `dataset_item_id` String,
    `dataset_id` String,
    `trace_id` String,
    `observation_id` Nullable(String),
    `error` Nullable(String),
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now(),
    `dataset_run_name` String,
    `dataset_run_description` Nullable(String),
    `dataset_run_metadata` Map(LowCardinality(String), String),
    `dataset_run_created_at` DateTime64(3),
    `dataset_item_input` Nullable(String) CODEC(ZSTD(3)),
    `dataset_item_expected_output` Nullable(String) CODEC(ZSTD(3)),
    `dataset_item_metadata` Map(LowCardinality(String), String),
    `event_ts` DateTime64(3),
    `is_deleted` UInt8,
    INDEX idx_dataset_item dataset_item_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/dataset_run_items_legacy',
    '{replica}',
    event_ts,
    is_deleted
)
ORDER BY (project_id, dataset_id, dataset_run_id, id);

CREATE TABLE event_log ON CLUSTER default
(
    `id` String,
    `project_id` String,
    `entity_type` String,
    `entity_id` String,
    `event_id` Nullable(String),
    `bucket_name` String,
    `bucket_path` String,
    `created_at` DateTime64(3) DEFAULT now(),
    `updated_at` DateTime64(3) DEFAULT now()
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/event_log_legacy',
    '{replica}'
)
ORDER BY (project_id, entity_type, entity_id);

CREATE VIEW analytics_events_core ON CLUSTER default AS
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
    uniq(environment) AS count_environments,
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
    uniqIf(service_name, service_name != '') AS count_service_names,
    sumMap(map(if(scope_name = '', '-', concat(scope_name, '-', scope_version)), toUInt64(1))) AS count_scopes,
    sumMap(map(if(telemetry_sdk_language = '', '-', telemetry_sdk_language), toUInt64(1))) AS count_telemetry_sdk_languages,
    sumMap(map(if(telemetry_sdk_name = '', '-', concat(telemetry_sdk_language, '-', telemetry_sdk_name, '-', telemetry_sdk_version)), toUInt64(1))) AS count_sdk_telemetry_sdks,
    sumMap(map(concat(if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name), '@', if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version)), toUInt64(1))) AS ingested_sdks
FROM events_core
WHERE toStartOfHour(start_time) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY project_id, hour;

CREATE VIEW analytics_traces ON CLUSTER default AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countTraces,
    max(user_id IS NOT NULL) AS hasUsers,
    max(session_id IS NOT NULL) AS hasSessions,
    max(if(environment != 'default', 1, 0)) AS hasEnvironments,
    max(length(tags) > 0) AS hasTags
FROM traces
WHERE toStartOfHour(timestamp) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY project_id, hour;

CREATE VIEW analytics_observations ON CLUSTER default AS
SELECT
    project_id,
    type,
    toStartOfHour(start_time) AS hour,
    uniq(id) AS countObservations,
    max(level != 'DEFAULT') AS hasLevel,
    max(provided_model_name IS NOT NULL) AS hasProvidedModelName,
    max(length(provided_usage_details) > 0) AS hasProvidedUsageDetails,
    max(length(provided_cost_details) > 0) AS hasProvidedCostDetails,
    max(prompt_name IS NOT NULL) AS hasPromptName
FROM observations
WHERE toStartOfHour(start_time) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY project_id, type, hour;

CREATE VIEW analytics_scores ON CLUSTER default AS
SELECT
    project_id,
    toStartOfHour(timestamp) AS hour,
    uniq(id) AS countScores,
    max(source = 'ANNOTATION') AS hasAnnotation,
    max(source = 'API') AS hasApi,
    max(source = 'EVAL') AS hasEval,
    max(observation_id IS NOT NULL) AS hasObservationScore,
    max(session_id IS NOT NULL) AS hasSessionScore,
    max(dataset_run_id IS NOT NULL) AS hasDatasetRunScore,
    max(data_type = 'BOOLEAN') AS hasBoolScore,
    max(data_type = 'NUMERIC') AS hasNumericScore,
    max(data_type = 'CATEGORICAL') AS hasCategoricalScore,
    max(comment IS NOT NULL) AS hasComment,
    sumMap(map(
      concat(
        if(ingestion_sdk_name = '', 'unknown', ingestion_sdk_name),
        '@',
        if(ingestion_sdk_version = '', 'unknown', ingestion_sdk_version)
      ),
      toUInt64(1)
    )) AS ingested_sdks
FROM scores
WHERE toStartOfHour(timestamp) <= toStartOfHour(subtractHours(now(), 1))
GROUP BY project_id, hour;
