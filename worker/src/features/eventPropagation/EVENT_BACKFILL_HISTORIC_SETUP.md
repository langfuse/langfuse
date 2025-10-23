# Historic Event Table Backfill

In this document, we track approaches on how to do the historic backfill for the event table.
We need to add trace information (metadata, userId, sessionId) onto all observations and insert them into the new
events table.

To manage the backfill, we process by partition (`YYYYMM`) and, in addition, separate each partition into multiple chunks.
For this purpose, we compute a hash over the projectId to ensure that all observations in a project are processed together.
When we go back in time to lower volume month, we can continue to decrease the number of chunks if the ClickHouse resources
can handle the query.

## Query

```sql
 WITH relevant_keys AS (
    select distinct project_id, trace_id
    from observations
    WHERE _partition_id = '202509'
      AND (xxHash32(trace_id) % 256) = 1
), relevant_traces AS (
    select
        t.id as trace_id,
        t.project_id,
        t.user_id,
        t.session_id,
        mapFilter((k,v) -> NOT in(k, ['attributes']), t.metadata) AS metadata
    from traces t
    left semi join relevant_keys rk
    on t.project_id = rk.project_id and t.id = rk.trace_id
    where (xxHash32(t.id) % 256) = 1
    order by t.project_id, toDate(t.timestamp), t.id, t.event_ts desc
    limit 1 by t.project_id, t.id
  )

  INSERT INTO events (
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
    user_id,
    session_id,
    level,
    status_message,
    completion_start_time,
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
    total_cost,
    input,
    output,
    metadata,
    metadata_names,
    metadata_values,
    source,
    blob_storage_file_path,
    event_raw,
    event_bytes,
    created_at,
    updated_at,
    event_ts,
    is_deleted
 ) 

  SELECT
     o.project_id,
     o.trace_id,
     o.id AS span_id,
     if(o.id = o.trace_id, NULL, coalesce(o.parent_observation_id, concat('t-', o.trace_id))) AS parent_span_id,
     greatest(o.start_time, toDateTime64('1970-01-01', 3)) AS start_time,
     o.end_time,
     o.name,
     o.type,
     o.environment,
     o.version,
     coalesce(t.user_id, '') AS user_id,
     coalesce(t.session_id, '') AS session_id,
     o.level,
     coalesce(o.status_message, '') AS status_message,
     o.completion_start_time,
     o.prompt_id,
     o.prompt_name,
     CAST(o.prompt_version, 'Nullable(String)') AS prompt_version,
     o.internal_model_id AS model_id,
     o.provided_model_name,
     o.model_parameters,
     o.provided_usage_details,
     o.usage_details,
     o.provided_cost_details,
     o.cost_details,
     coalesce(o.total_cost, 0) AS total_cost,
     coalesce(o.input, '') AS input,
     coalesce(o.output, '') AS output,
     CAST(mapConcat(o.metadata, coalesce(t.metadata, map())), 'JSON') AS metadata,
     mapKeys(mapConcat(o.metadata, coalesce(t.metadata, map()))) AS metadata_names,
     mapValues(mapConcat(o.metadata, coalesce(t.metadata, map()))) AS metadata_values,
     multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
     '' AS blob_storage_file_path,
     '' AS event_raw,
     byteSize(*) AS event_bytes,
     o.created_at,
     o.updated_at,
     o.event_ts,
     o.is_deleted
  FROM observations AS o
  LEFT JOIN relevant_traces AS t ON (o.project_id = t.project_id) AND (o.trace_id = t.trace_id)
  WHERE (o._partition_id = '202509') AND ((xxHash32(t.trace_id) % 256) = 1)
     
  SETTINGS
    -- join_algorithm = 'partial_merge',
    min_insert_block_size_bytes = '512Mi',
    parallel_distributed_insert_select = 2,
    enable_parallel_replicas = 1,
    -- allow_experimental_parallel_reading_from_replicas = 1,
    -- max_parallel_replicas = 3,
    type_json_skip_duplicated_paths = 1;
```

## Misc / Utils

### Create a mapping table and use if for joins directly instead of filtering/deduplicating on write

```sql
CREATE TABLE IF NOT EXISTS trace_attrs
(
    project_id String,
    trace_id   String,

    -- Stable attributes you need on events
    user_id    String,
    session_id String,
    metadata   Map(LowCardinality(String), String),

    -- Versioning columns for ReplacingMergeTree
    event_ts   DateTime64(3),
    is_deleted UInt8 DEFAULT 0,
)
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
ORDER BY (project_id, trace_id);

INSERT INTO trace_attrs
SELECT
    t.project_id,
    t.id AS trace_id,
    t.user_id,
    t.session_id,
    mapFilter((k,v) -> NOT in(k, ['attributes','debug_info']), t.metadata) AS metadata,
    t.event_ts,
    0 AS is_deleted
FROM traces AS t FINAL -- deduplicate before writing!
WHERE t.is_deleted = 0
AND _partition_id = '202509'
SETTINGS 
    max_insert_threads = 16,
    min_insert_block_size_rows = 10048576;


INSERT INTO events (
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
    user_id,
    session_id,
    level,
    status_message,
    completion_start_time,
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
    total_cost,
    input,
    output,
    metadata,
    metadata_names,
    metadata_values,
    source,
    blob_storage_file_path,
    event_raw,
    event_bytes,
    created_at,
    updated_at,
    event_ts,
    is_deleted
)
SELECT -- count(*)
       o.project_id,
       o.trace_id,
       o.id AS span_id,
       if(o.id = o.trace_id, NULL, coalesce(o.parent_observation_id, concat('t-', o.trace_id))) AS parent_span_id,
       greatest(o.start_time, toDateTime64('1970-01-01', 3)) AS start_time,
       o.end_time,
       o.name,
       o.type,
       o.environment,
       o.version,
       coalesce(t.user_id, '') AS user_id,
       coalesce(t.session_id, '') AS session_id,
       o.level,
       coalesce(o.status_message, '') AS status_message,
       o.completion_start_time,
       o.prompt_id,
       o.prompt_name,
       CAST(o.prompt_version, 'Nullable(String)') AS prompt_version,
       o.internal_model_id AS model_id,
       o.provided_model_name,
       o.model_parameters,
       o.provided_usage_details,
       o.usage_details,
       o.provided_cost_details,
       o.cost_details,
       coalesce(o.total_cost, 0) AS total_cost,
       coalesce(o.input, '')  AS input,
       coalesce(o.output, '') AS output,
       CAST(mapConcat(o.metadata, coalesce(t.metadata, map())), 'JSON') AS metadata,
       mapKeys(mapConcat(o.metadata, coalesce(t.metadata, map()))) AS metadata_names,
       mapValues(mapConcat(o.metadata, coalesce(t.metadata, map()))) AS metadata_values,
       multiIf(mapContains(o.metadata, 'resourceAttributes'), 'otel', 'ingestion-api') AS source,
       '' AS blob_storage_file_path,
       '' AS event_raw,
       0 AS event_bytes,
       o.created_at,
       o.updated_at,
       o.event_ts,
       o.is_deleted
FROM observations o
LEFT JOIN trace_attrs t
ON o.project_id = t.project_id AND o.trace_id = t.trace_id
WHERE o._partition_id = '202509'
  AND (xxHash32(o.trace_id) % 128) = 1
SETTINGS
    join_algorithm = 'partial_merge',
    min_insert_block_size_bytes = '512Mi',
    parallel_distributed_insert_select = 2,
    enable_parallel_replicas = 1,
    -- allow_experimental_parallel_reading_from_replicas = 1,
    -- max_parallel_replicas = 3,
    type_json_skip_duplicated_paths = 1;
```

### Remove full text indexes for faster ingest

```sql
-- Drop Full Text indexes for faster ingest
ALTER TABLE events
    DROP INDEX idx_fts_input_1,
    DROP INDEX idx_fts_input_2,
    DROP INDEX idx_fts_input_4,
    DROP INDEX idx_fts_input_8,
    DROP INDEX idx_fts_output_1,
    DROP INDEX idx_fts_output_2,
    DROP INDEX idx_fts_output_4,
    DROP INDEX idx_fts_output_8;
```

### Check progress on a running query

```sql
-- Check the progress
select elapsed, read_rows, read_bytes, total_rows_approx, written_rows, written_bytes,
       memory_usage, peak_memory_usage, ProfileEvents, Settings
from clusterAllReplicas('default', 'system.processes')
where query_id = '<uuid>'
format vertical;
```