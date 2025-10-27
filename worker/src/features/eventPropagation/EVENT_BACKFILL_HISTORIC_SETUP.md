# Historic Event Table Backfill

In this document, we track approaches on how to do the historic backfill for the event table.
We need to add trace information (metadata, userId, sessionId) onto all observations and insert them into the new
events table.

To manage the backfill, we process by partition (`YYYYMM`) and, in addition, separate each partition into multiple chunks.
For this purpose, we compute a hash over the projectId to ensure that all observations in a project are processed together.
When we go back in time to lower volume month, we can continue to decrease the number of chunks if the ClickHouse resources
can handle the query.

## Background Migration Implementation

The historic backfill has been implemented as a background migration job that automates the entire process.

### Key Features

- **Automatic partition discovery**: Discovers all partitions from observations table
- **Dynamic chunking**: Calculates optimal modulo value (power of 2) based on partition size, targeting ~10M records per chunk
- **Per-chunk processing**: For each chunk, performs both operations sequentially:
  1. Populates `trace_attrs` table from `traces` for this chunk
  2. Populates `events` table from `observations` joined with `trace_attrs` for this chunk
  3. Truncates `trace_attrs` to keep it small (only one chunk at a time)
- **Memory efficient**: `trace_attrs` only ever contains data for a single chunk (~10M rows max)
- **Newest-first processing**: Processes partitions from most recent to oldest
- **Resumable**: Maintains state in PostgreSQL, can be stopped and resumed at any time
- **Observable**: State shows current partition and completed chunks

### Configuration

Default configuration (can be overridden in migration args):
- `targetChunkSize`: 10,000,000 rows per chunk
- `maxModulo`: 256 (maximum parallelization level)
- `batchTimeoutMs`: 600,000ms (10 minutes per chunk)

### Implementation Details

**Location:** `worker/src/backgroundMigrations/backfillEventsHistoric.ts`

**State tracking example:**
```json
{
  "partitions": {
    "202510": {
      "modulo": 256,
      "rowCount": 2500000000,
      "chunksProcessed": [0, 1, 2, ..., 128],
      "lastUpdated": "2025-10-27T15:05:31.000Z"
    },
    "202509": {
      "modulo": 128,
      "rowCount": 1200000000,
      "chunksProcessed": [0, 1, 2, ..., 127],
      "lastUpdated": "2025-10-27T14:30:15.000Z"
    }
  },
  "currentPartition": "202510",
  "completedPartitions": ["202509"]
}
```

**Processing flow per chunk:**
```
For partition 202510, chunk 0:
  1. INSERT INTO trace_attrs ... WHERE xxHash32(trace_id) % 256 = 0
  2. INSERT INTO events ... LEFT JOIN trace_attrs ... WHERE xxHash32(trace_id) % 256 = 0
  3. TRUNCATE TABLE trace_attrs

For partition 202510, chunk 1:
  1. INSERT INTO trace_attrs ... WHERE xxHash32(trace_id) % 256 = 1
  2. INSERT INTO events ... LEFT JOIN trace_attrs ... WHERE xxHash32(trace_id) % 256 = 1
  3. TRUNCATE TABLE trace_attrs

... continues for all 256 chunks
```

## Manual Execution Reference

The sections below describe the original manual approach for reference and debugging.
The background migration implementation above is the **recommended approach** for production use.

## Query (Manual Approach)

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
        mapConcat(
            mapFilter((k,v) -> NOT in(k, ['attributes']), t.metadata),
            if(length(t.tags) > 0, map('trace_tags', toJSONString(t.tags)), map())
        ) AS metadata
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

-- Using the query below, I found that < 200k traces for August and September have duplicates.
-- This may mean that it's acceptable to fill the trace_attrs table without deduplication as it's < 0.1.
-- This may mean missing user/session information on a small percentile of observations, but a simpler migration path.
-- select count(*) from (
--     select project_id, id, count(*)
--     from traces
--     WHERE _partition_id = '202509'
--     group by 1, 2
--     having count(*) > 1
-- );
INSERT INTO trace_attrs
SELECT
    t.project_id,
    t.id AS trace_id,
    t.user_id,
    t.session_id,
    mapConcat(
        mapFilter((k,v) -> NOT in(k, ['attributes']), t.metadata),
        if(length(t.tags) > 0, map('trace_tags', toJSONString(t.tags)), map())
    ) AS metadata,
    t.event_ts,
    0 AS is_deleted
FROM traces AS t -- FINAL -- deduplicate before writing!
WHERE t.is_deleted = 0
AND _partition_id = '202509'
AND (t.user_id is not null OR t.session_id is not null OR length(mapKeys(t.metadata)) > 0 OR length(t.tags) > 0)
SETTINGS
    max_threads = 4,
    parallel_distributed_insert_select = 2,
    enable_parallel_replicas = 1,
    max_insert_threads = 4,
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
ON o.project_id = t.project_id AND o.trace_id = t.trace_id AND (xxHash32(t.trace_id) % 128) = 1 AND t._partition_id = '202509'
WHERE o._partition_id = '202509'
  AND (xxHash32(o.trace_id) % 128) = 1
SETTINGS
    -- max_threads = 4, -- Review for speed and throughput
    min_insert_block_size_rows = 10048576,
    join_algorithm = 'partial_merge',
    min_insert_block_size_bytes = '512Mi',
    parallel_distributed_insert_select = 2,
    enable_parallel_replicas = 1,
    allow_experimental_parallel_reading_from_replicas = 1,
    max_parallel_replicas = 2,
    type_json_skip_duplicated_paths = 1;
```

### Check progress on a running query

```sql
-- Check the progress
select elapsed, read_rows, read_bytes, total_rows_approx, written_rows, written_bytes,
       memory_usage, peak_memory_usage, ProfileEvents, Settings
from clusterAllReplicas('default', 'system.processes')
where query_id = '<uuid>'
format vertical
SETTINGS skip_unavailable_shards = 1;
```