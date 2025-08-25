# IngestionService

## Experimental Setup with AggregatingMergeTrees

Warn: Do not apply on your own as this is highly experimental and may change anytime.

To reduce the costs associated with trace processing, we aim to derive trace information from spans eventually.
As a first step, we created a `traces_mt` table which acted as a proxy for a bunch of AggregatingMergeTrees that collapse
trace writes into a single row.
We have now moved to a `traces_null` table that doesn't store intermediate results to save on storage and compute overhead.

We can enable experimental writes to the `traces_null` table by setting `LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES=true`.
This requires that the following table schema is manually applied on the database instance:

```sql
-- Setup
-- Context: https://fiddle.clickhouse.com/d4e84b88-6bd7-455c-9a84-e9126594f92a


-- TODO: Make sure to update migrateTracesToTracesAMTs.ts if the traces_null schema changes

-- Create a Null table that serves as a trigger for all materialized views.
-- We use a Null engine here to avoid storing intermediate results and save on storage.
CREATE TABLE traces_null
(
    -- Identifiers
    `project_id`      String,
    `id`              String,
    `start_time`      DateTime64(3),
    `end_time`        Nullable(DateTime64(3)),
    `name`            Nullable(String),

    -- Metadata properties
    `metadata`        Map(LowCardinality(String), String),
    `user_id`         Nullable(String),
    `session_id`      Nullable(String),
    `environment`     String,
    `tags`            Array(String),
    `version`         Nullable(String),
    `release`         Nullable(String),

    -- UI properties - We make them nullable to prevent absent values being interpreted as overwrites.
    `bookmarked`      Nullable(Bool),
    `public`          Nullable(Bool),

    -- Aggregations
    `observation_ids` Array(String),
    `score_ids`       Array(String),
    `cost_details`    Map(String, Decimal64(12)),
    `usage_details`   Map(String, UInt64),
    -- TODO: Do we want to aggregate/collect `levels` seen within the trace?

    -- Input/Output
    `input`           String,
    `output`          String,

    `created_at`      DateTime64(3),
    `updated_at`      DateTime64(3),
    `event_ts`        DateTime64(3)
) Engine = Null();

-- Create the all AMT
CREATE TABLE traces_all_amt
(
    -- Identifiers
    `project_id`         String,
    `id`                 String,
    `timestamp`          SimpleAggregateFunction(min, DateTime64(3)),  -- Backward compatibility: redundant with start_time
    `start_time`         SimpleAggregateFunction(min, DateTime64(3)),
    `end_time`           SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `name`               SimpleAggregateFunction(anyLast, Nullable(String)),

    -- Metadata properties
    `metadata`           SimpleAggregateFunction(maxMap, Map(String, String)),
    `user_id`            SimpleAggregateFunction(anyLast, Nullable(String)),
    `session_id`         SimpleAggregateFunction(anyLast, Nullable(String)),
    `environment`        SimpleAggregateFunction(anyLast, String),
    `tags`               SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `version`            SimpleAggregateFunction(anyLast, Nullable(String)),
    `release`            SimpleAggregateFunction(anyLast, Nullable(String)),

    -- UI properties
    `bookmarked`         AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),
    `public`             AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),

    -- Aggregations
    `observation_ids`    SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `score_ids`          SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details`       SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `usage_details`      SimpleAggregateFunction(sumMap, Map(String, UInt64)),

    -- Input/Output -> prefer correctness via argMax
    `input`       AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `output`      AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),

    `created_at`         SimpleAggregateFunction(min, DateTime64(3)),
    `updated_at`         SimpleAggregateFunction(max, DateTime64(3)),

    -- Indexes
    INDEX idx_trace_id id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_name name TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_version version TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_release release TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_tags tags TYPE bloom_filter(0.001) GRANULARITY 1
) Engine = AggregatingMergeTree()
      ORDER BY (project_id, id);

-- Create materialized view for all_amt
-- Create the materialized view for unclustered deployment:
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_all_amt_mv TO traces_all_amt AS
SELECT
    -- Identifiers
    tn.project_id                                                                              as project_id,
    tn.id                                                                                      as id,
    min(tn.start_time)                                                                         as timestamp,  -- Backward compatibility: redundant with start_time
    min(tn.start_time)                                                                         as start_time,
    max(coalesce(tn.end_time, tn.start_time))                                                  as end_time,
    anyLast(tn.name)                                                                           as name,

    -- Metadata properties
    maxMap(tn.metadata)                                                                        as metadata,
    anyLast(tn.user_id)                                                                        as user_id,
    anyLast(tn.session_id)                                                                     as session_id,
    anyLast(tn.environment)                                                                    as environment,
    groupUniqArrayArray(tn.tags)                                                               as tags,
    anyLast(tn.version)                                                                        as version,
    anyLast(tn.release)                                                                        as release,

    -- UI properties
    argMaxState(tn.bookmarked, if(tn.bookmarked is not null, tn.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(tn.public, if(tn.public is not null, tn.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(tn.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(tn.score_ids)                                                          as score_ids,
    sumMap(tn.cost_details)                                                                    as cost_details,
    sumMap(tn.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(tn.input, if(tn.input <> '', tn.event_ts, toDateTime64(0, 3)))                 as input,
    argMaxState(tn.output, if(tn.output <> '', tn.event_ts, toDateTime64(0, 3)))               as output,

    min(tn.created_at)                                                                         as created_at,
    max(tn.updated_at)                                                                         as updated_at
FROM traces_null tn
GROUP BY project_id, id;

-- Create the 7-day TTL AMT
CREATE TABLE traces_7d_amt
(
    -- Identifiers
    `project_id`         String,
    `id`                 String,
    `timestamp`          SimpleAggregateFunction(min, DateTime64(3)),  -- Backward compatibility: redundant with start_time
    `start_time`         SimpleAggregateFunction(min, DateTime64(3)),
    `end_time`           SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `name`               SimpleAggregateFunction(anyLast, Nullable(String)),

    -- Metadata properties
    `metadata`           SimpleAggregateFunction(maxMap, Map(String, String)),
    `user_id`            SimpleAggregateFunction(anyLast, Nullable(String)),
    `session_id`         SimpleAggregateFunction(anyLast, Nullable(String)),
    `environment`        SimpleAggregateFunction(anyLast, String),
    `tags`               SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `version`            SimpleAggregateFunction(anyLast, Nullable(String)),
    `release`            SimpleAggregateFunction(anyLast, Nullable(String)),

    -- UI properties
    `bookmarked`         AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),
    `public`             AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),

    -- Aggregations
    `observation_ids`    SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `score_ids`          SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details`       SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `usage_details`      SimpleAggregateFunction(sumMap, Map(String, UInt64)),

    -- Input/Output -> prefer correctness via argMax
    `input`       AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `output`      AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),

    `created_at`         SimpleAggregateFunction(min, DateTime64(3)),
    `updated_at`         SimpleAggregateFunction(max, DateTime64(3)),

    -- Indexes
    INDEX idx_user_id user_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_name name TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_version version TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_release release TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_tags tags TYPE bloom_filter(0.001) GRANULARITY 1
) Engine = AggregatingMergeTree()
    ORDER BY (project_id, id)
    TTL toDate(start_time) + INTERVAL 7 DAY;

-- Create materialized view for 7d_amt
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_7d_amt_mv TO traces_7d_amt AS
SELECT
    -- Identifiers
    tn.project_id                                                                              as project_id,
    tn.id                                                                                      as id,
    min(tn.start_time)                                                                         as timestamp,  -- Backward compatibility: redundant with start_time
    min(tn.start_time)                                                                         as start_time,
    max(coalesce(tn.end_time, tn.start_time))                                                  as end_time,
    anyLast(tn.name)                                                                           as name,

    -- Metadata properties
    maxMap(tn.metadata)                                                                        as metadata,
    anyLast(tn.user_id)                                                                        as user_id,
    anyLast(tn.session_id)                                                                     as session_id,
    anyLast(tn.environment)                                                                    as environment,
    groupUniqArrayArray(tn.tags)                                                               as tags,
    anyLast(tn.version)                                                                        as version,
    anyLast(tn.release)                                                                        as release,

    -- UI properties
    argMaxState(tn.bookmarked, if(tn.bookmarked is not null, tn.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(tn.public, if(tn.public is not null, tn.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(tn.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(tn.score_ids)                                                          as score_ids,
    sumMap(tn.cost_details)                                                                    as cost_details,
    sumMap(tn.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(tn.input, if(tn.input <> '', tn.event_ts, toDateTime64(0, 3)))                 as input,
    argMaxState(tn.output, if(tn.output <> '', tn.event_ts, toDateTime64(0, 3)))               as output,

    min(tn.created_at)                                                                         as created_at,
    max(tn.updated_at)                                                                         as updated_at
FROM traces_null tn
GROUP BY project_id, id;

-- Create the 30-day TTL AMT
CREATE TABLE traces_30d_amt
(
    -- Identifiers
    `project_id`         String,
    `id`                 String,
    `timestamp`          SimpleAggregateFunction(min, DateTime64(3)),  -- Backward compatibility: redundant with start_time
    `start_time`         SimpleAggregateFunction(min, DateTime64(3)),
    `end_time`           SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `name`               SimpleAggregateFunction(anyLast, Nullable(String)),

    -- Metadata properties
    `metadata`           SimpleAggregateFunction(maxMap, Map(String, String)),
    `user_id`            SimpleAggregateFunction(anyLast, Nullable(String)),
    `session_id`         SimpleAggregateFunction(anyLast, Nullable(String)),
    `environment`        SimpleAggregateFunction(anyLast, String),
    `tags`               SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `version`            SimpleAggregateFunction(anyLast, Nullable(String)),
    `release`            SimpleAggregateFunction(anyLast, Nullable(String)),

    -- UI properties
    `bookmarked`         AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),
    `public`             AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),

    -- Aggregations
    `observation_ids`    SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `score_ids`          SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details`       SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `usage_details`      SimpleAggregateFunction(sumMap, Map(String, UInt64)),

    -- Input/Output -> prefer correctness via argMax
    `input`       AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `output`      AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),

    `created_at`         SimpleAggregateFunction(min, DateTime64(3)),
    `updated_at`         SimpleAggregateFunction(max, DateTime64(3)),

    -- Indexes
    INDEX idx_user_id user_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_name name TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_version version TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_release release TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_tags tags TYPE bloom_filter(0.001) GRANULARITY 1
) Engine = AggregatingMergeTree()
    ORDER BY (project_id, id)
    TTL toDate(start_time) + INTERVAL 30 DAY;

-- Create materialized view for 30d_amt
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_30d_amt_mv TO traces_30d_amt AS
SELECT
    -- Identifiers
    tn.project_id                                                                              as project_id,
    tn.id                                                                                      as id,
    min(tn.start_time)                                                                         as timestamp,  -- Backward compatibility: redundant with start_time
    min(tn.start_time)                                                                         as start_time,
    max(coalesce(tn.end_time, tn.start_time))                                                  as end_time,
    anyLast(tn.name)                                                                           as name,

    -- Metadata properties
    maxMap(tn.metadata)                                                                        as metadata,
    anyLast(tn.user_id)                                                                        as user_id,
    anyLast(tn.session_id)                                                                     as session_id,
    anyLast(tn.environment)                                                                    as environment,
    groupUniqArrayArray(tn.tags)                                                               as tags,
    anyLast(tn.version)                                                                        as version,
    anyLast(tn.release)                                                                        as release,

    -- UI properties
    argMaxState(tn.bookmarked, if(tn.bookmarked is not null, tn.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(tn.public, if(tn.public is not null, tn.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(tn.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(tn.score_ids)                                                          as score_ids,
    sumMap(tn.cost_details)                                                                    as cost_details,
    sumMap(tn.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(tn.input, if(tn.input <> '', tn.event_ts, toDateTime64(0, 3)))                 as input,
    argMaxState(tn.output, if(tn.output <> '', tn.event_ts, toDateTime64(0, 3)))               as output,

    min(tn.created_at)                                                                         as created_at,
    max(tn.updated_at)                                                                         as updated_at
FROM traces_null tn
GROUP BY project_id, id;
```

## Query AggregatingMergeTrees

We can query the properties of the resulting AggregatingMergeTree via (make sure to pick the right timeframe:

```sql
SELECT
  -- Identifiers
  project_id,
  id,
  start_time,
  end_time,
  name,

  -- Metadata properties
  metadata,
  user_id,
  session_id,
  environment,
  tags,
  version,
  release,

  -- UI properties
  finalizeAggregation(bookmarked) AS bookmarked_value,
  finalizeAggregation(public) AS public_value,

  -- Aggregations
  observation_ids,
  score_ids,
  cost_details,
  usage_details,

  -- Input/Output
  finalizeAggregation(input) AS input_value,
  finalizeAggregation(output) AS output_value,

  created_at,
  updated_at
FROM traces_all_amt
LIMIT 100;
```

## Find discrepancies

We can identify discrepancies in the original and the new data using

```sql
-- Query to compare traces_all_amt with traces table and identify discrepancies
WITH amt_data AS (
-- First get the finalized values from the AMT table
  SELECT project_id,
         id,
         start_time,
         end_time,
         name,

         metadata,
         user_id,
         session_id,
         environment,
         tags,
         version,
         release,

         finalizeAggregation(bookmarked) AS bookmarked_value,
         finalizeAggregation(public) AS public_value,

         finalizeAggregation(input) AS input_value,
         finalizeAggregation(output) AS output_value,

         created_at,
         updated_at
  FROM traces_all_amt
)

-- Main query to compare AMT with original traces table
SELECT t.project_id,
       t.id,
       -- Null-safe difference detection
       NOT (t.timestamp = a.start_time OR (t.timestamp IS NULL AND a.start_time IS NULL)) AS timestamp_diff,
       NOT (t.name = a.name OR (t.name IS NULL AND a.name IS NULL)) AS name_diff,
       NOT (t.user_id = a.user_id OR (t.user_id IS NULL AND a.user_id IS NULL)) AS user_id_diff,
       NOT (t.session_id = a.session_id OR (t.session_id IS NULL AND a.session_id IS NULL)) AS session_id_diff,
       NOT (t.release = a.release OR (t.release IS NULL AND a.release IS NULL)) AS release_diff,
       NOT (t.version = a.version OR (t.version IS NULL AND a.version IS NULL)) AS version_diff,
       NOT (t.public = a.public_value OR (t.public IS NULL AND a.public_value IS NULL)) AS public_diff,
       NOT (t.bookmarked = a.bookmarked_value OR (t.bookmarked IS NULL AND a.bookmarked_value IS NULL)) AS bookmarked_diff,
       NOT (arraySort(t.tags) = arraySort(a.tags) OR (t.tags IS NULL AND a.tags IS NULL)) AS tags_diff,
       NOT (t.input = a.input_value OR (t.input IS NULL AND a.input_value IS NULL)) AS input_diff,
       NOT (t.output = a.output_value OR (t.output IS NULL AND a.output_value IS NULL)) AS output_diff,
       -- Order-independent metadata comparison
       NOT (
         -- Check if both are null
         (t.metadata IS NULL AND a.metadata IS NULL) OR
         -- Check if both have same keys and values
         (t.metadata IS NOT NULL AND a.metadata IS NOT NULL AND
          arraySort(mapKeys(t.metadata)) = arraySort(mapKeys(a.metadata)) AND
          arrayAll(k -> t.metadata[k] = a.metadata[k], mapKeys(t.metadata)))
       ) AS metadata_diff,
       NOT (t.environment = a.environment OR (t.environment IS NULL AND a.environment IS NULL)) AS environment_diff,

       -- Include original values for comparison
       t.timestamp                                AS traces_timestamp,
       a.start_time                               AS amt_start_time,
       t.name                                     AS traces_name,
       a.name                                     AS amt_name,
       t.user_id                                  AS traces_user_id,
       a.user_id                                  AS amt_user_id,
       t.session_id                               AS traces_session_id,
       a.session_id                               AS amt_session_id,
       t.environment                              AS traces_environment,
       a.environment                              AS amt_environment,

       t.metadata                                 AS traces_metadata,
       a.metadata                                 AS amt_metadata,
       arraySort(t.tags)                          AS traces_tags,
       arraySort(a.tags)                          AS amt_tags,
       t.bookmarked                               AS traces_bookmarked,
       a.bookmarked_value                         AS amt_bookmarked,
       t.public                                   AS traces_public,
       a.public_value                             AS amt_public,
       t.release                                  AS traces_release,
       a.release                                  AS amt_release,
       t.version                                  AS traces_version,
       a.version                                  AS amt_version,

       t.input                                    AS traces_input,
       a.input_value                              AS amt_input,
       t.output                                   AS traces_output,
       a.output_value                             AS amt_output,

       timestamp_diff +
       name_diff +
       user_id_diff +
       session_id_diff +
       release_diff +
       version_diff +
       public_diff +
       bookmarked_diff +
       tags_diff +
       input_diff +
       output_diff +
       metadata_diff +
       environment_diff
                                                  AS total_diff

FROM traces t FINAL
LEFT JOIN amt_data a ON t.project_id = a.project_id AND t.id = a.id
WHERE (t.timestamp >= '2025-07-01' OR a.start_time >= '2025-07-01')
AND t.project_id IN (
  'some-project-id'
)
ORDER BY total_diff DESC
LIMIT 1000;
```

## Traces Table Access Pattern Checklist

This checklist documents all references and invocations to the `traces` table grouped by their access pattern. Use this as a baseline to perform transformations like the one in `@/packages/shared/src/server/repositories/traces.ts` with the `measureAndReturn` utility.

### 1. Single Record Lookups (by ID)

- [ ] **IngestionService.getClickhouseRecord()** - `worker/src/services/IngestionService/index.ts:1047-1065`
  - Can probably be skipped as read for updates won't be a thing in the new flow.
- [x] **getTraceById()** - `packages/shared/src/server/repositories/traces.ts:443-486`
- [x] **getTracesByIds()** - `packages/shared/src/server/repositories/traces.ts:233-264`

### 2. Session-Based Queries

- [x] **getTracesBySessionId()** - `packages/shared/src/server/repositories/traces.ts:266-304`
- [x] **getTracesIdentifierForSession()** - `packages/shared/src/server/repositories/traces.ts:642-688`

### 3. Existence Checks

- [x] **checkTraceExistsAndGetTimestamp()** - `packages/shared/src/server/repositories/traces.ts:73-210`
- [x] **hasAnyTrace()** - `packages/shared/src/server/repositories/traces.ts:306-356`
- [x] **hasAnyUser()** - `packages/shared/src/server/repositories/traces.ts:763-787`

### 4. Aggregation and Analytics Queries

- [x] **getTracesCountForPublicApi()** - `web/src/features/public-api/server/traces.ts:299`
- [x] **generateDailyMetrics()** - `web/src/features/public-api/server/dailyMetrics.ts:93`
- [x] **getDailyMetricsCount()** - `web/src/features/public-api/server/dailyMetrics.ts:153`
- [x] **generateObservationsForPublicApi()** - `web/src/features/public-api/server/observations.ts:80`
- [x] **getObservationsCountForPublicApi()** - `web/src/features/public-api/server/observations.ts:108`
- [x] **getObservationsTableInternal()** - `packages/shared/src/server/repositories/observations.ts:565`
- [x] **\_handleGenerateScoresForPublicApi()** - `web/src/features/public-api/server/scores.ts:101`
- [x] **\_handleGetScoresCountForPublicApi()** - `web/src/features/public-api/server/scores.ts:181`
- [x] **getScoresUiGeneric()** - `packages/shared/src/server/repositories/scores.ts:825`
- [x] **getNumericScoreHistogram()** - `packages/shared/src/server/repositories/scores.ts:1074`
- [x] **getTracesGroupedByName()** - `packages/shared/src/server/repositories/traces.ts:489-535`
- [x] **getTracesGroupedByUsers()** - `packages/shared/src/server/repositories/traces.ts:537-597`
- [x] **getTracesGroupedByTags()** - `packages/shared/src/server/repositories/traces.ts:605-640`
- [x] **getTotalUserCount()** - `packages/shared/src/server/repositories/traces.ts:789-827`
- [x] **getUserMetrics()** - `packages/shared/src/server/repositories/traces.ts:829-978`
- [x] **getTracesTableGeneric()** - `packages/shared/src/server/services/traces-ui-table-service.ts:207++`
- [x] **getSessionsTableGeneric()** - `packages/shared/src/server/services/sessions-ui-table-service.ts:121++`)
- [x] **generateTracesForPublicApi()** - `web/src/features/public-api/server/traces.ts:36++`

### 5. Data Export and Migration

Note: The measureAndReturn utility does not handle query streams well as it promisifies everything.
We need to cover these queries manually and cannot run a comparison.
We could use an opt-in on a projectId basis.

- [x] **getTracesForPostHog()** - `packages/shared/src/server/repositories/traces.ts:1026-1113`
- [x] **getScoresForPostHog()** - `packages/shared/src/server/repositories/scores.ts:1328`
- [x] **getGenerationsForPosthog()** - `packages/shared/src/server/repositories/observations.ts:1481`
- [x] **getTracesForBlobStorageExport()** - `packages/shared/src/server/repositories/traces.ts:980-1024`

### 6. Count and Statistics Queries

- [x] **getTraceCountsByProjectInCreationInterval()** - `packages/shared/src/server/repositories/traces.ts:358-392`
- [x] **getTraceCountOfProjectsSinceCreationDate()** - `packages/shared/src/server/repositories/traces.ts:394-423`

### 7. Cross-Project Queries

- [x] **getTracesByIdsForAnyProject()** - `packages/shared/src/server/repositories/traces.ts:1115-1141`

### 8. Delete Operations

- [x] **deleteTraces()** - `packages/shared/src/server/repositories/traces.ts:790++`
- [x] **deleteTracesOlderThanDays()** - `packages/shared/src/server/repositories/traces.ts:814++`
- [x] **deleteTracesByProjectId()** - `packages/shared/src/server/repositories/traces.ts:841++`

### 9. Writes

- [x] **upsertTrace()** - `packages/shared/src/server/repositories/traces.ts:224`
