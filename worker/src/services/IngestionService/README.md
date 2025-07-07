# IngestionService

## Experimental Setup with AggregatingMergeTrees

Warn: Do not apply on your own as this is highly experimental and may change anytime.

To reduce the costs associated with trace processing, we aim to derive trace information from spans eventually.
As a first step, we create a new `traces_mt` table which acts as a proxy for a bunch of AggregatingMergeTrees that collapse
trace writes into a single row.
Eventually, we may move the `traces_mt` table to a `traces_null` table that doesn't store intermediate results.

We can enable experimental writes to the `traces_mt` table by setting `LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES=true`.
This requires that the following table schema is manually applied on the database instance:

```sql
-- Setup
-- Context: https://fiddle.clickhouse.com/d4e84b88-6bd7-455c-9a84-e9126594f92a

-- Create a MergeTree table that serves as a trigger for all others.
-- We use a MergeTree here to track what was being inserted. Could be replaced
-- with a NULL table in future to save on storage.
CREATE TABLE traces_mt
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
) Engine = MergeTree()
      ORDER BY (project_id, id)
      PARTITION BY toYYYYMM(start_time);

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
    `metadata`           SimpleAggregateFunction(minMap, Map(String, String)),
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
      ORDER BY (project_id, id);

-- Create materialized view for all_amt
-- Create the materialized view for unclustered deployment:
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_all_amt_mv TO traces_all_amt AS
SELECT
    -- Identifiers
    t0.project_id                                                                              as project_id,
    t0.id                                                                                      as id,
    min(t0.start_time)                                                                         as timestamp,  -- Backward compatibility: redundant with start_time
    min(t0.start_time)                                                                         as start_time,
    max(coalesce(t0.end_time, t0.start_time))                                                  as end_time,
    anyLast(t0.name)                                                                           as name,

    -- Metadata properties
    minMap(t0.metadata)                                                                        as metadata,
    anyLast(t0.user_id)                                                                        as user_id,
    anyLast(t0.session_id)                                                                     as session_id,
    anyLast(t0.environment)                                                                    as environment,
    groupUniqArrayArray(t0.tags)                                                               as tags,
    anyLast(t0.version)                                                                        as version,
    anyLast(t0.release)                                                                        as release,

    -- UI properties
    argMaxState(t0.bookmarked, if(t0.bookmarked is not null, t0.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(t0.public, if(t0.public is not null, t0.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(t0.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(t0.score_ids)                                                          as score_ids,
    sumMap(t0.cost_details)                                                                    as cost_details,
    sumMap(t0.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(t0.input, if(t0.input <> '', t0.event_ts, toDateTime64(0, 3)))                 as input,
    argMaxState(t0.output, if(t0.output <> '', t0.event_ts, toDateTime64(0, 3)))               as output,

    min(t0.created_at)                                                                         as created_at,
    max(t0.updated_at)                                                                         as updated_at
FROM traces_mt t0
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
    `metadata`           SimpleAggregateFunction(minMap, Map(String, String)),
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
    t0.project_id                                                                              as project_id,
    t0.id                                                                                      as id,
    min(t0.start_time)                                                                         as timestamp,  -- Backward compatibility: redundant with start_time
    min(t0.start_time)                                                                         as start_time,
    max(coalesce(t0.end_time, t0.start_time))                                                  as end_time,
    anyLast(t0.name)                                                                           as name,

    -- Metadata properties
    minMap(t0.metadata)                                                                        as metadata,
    anyLast(t0.user_id)                                                                        as user_id,
    anyLast(t0.session_id)                                                                     as session_id,
    anyLast(t0.environment)                                                                    as environment,
    groupUniqArrayArray(t0.tags)                                                               as tags,
    anyLast(t0.version)                                                                        as version,
    anyLast(t0.release)                                                                        as release,

    -- UI properties
    argMaxState(t0.bookmarked, if(t0.bookmarked is not null, t0.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(t0.public, if(t0.public is not null, t0.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(t0.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(t0.score_ids)                                                          as score_ids,
    sumMap(t0.cost_details)                                                                    as cost_details,
    sumMap(t0.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(t0.input, if(t0.input <> '', t0.event_ts, toDateTime64(0, 3)))                 as input,
    argMaxState(t0.output, if(t0.output <> '', t0.event_ts, toDateTime64(0, 3)))               as output,

    min(t0.created_at)                                                                         as created_at,
    max(t0.updated_at)                                                                         as updated_at
FROM traces_mt t0
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
    `metadata`           SimpleAggregateFunction(minMap, Map(String, String)),
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
    t0.project_id                                                                              as project_id,
    t0.id                                                                                      as id,
    min(t0.start_time)                                                                         as timestamp,  -- Backward compatibility: redundant with start_time
    min(t0.start_time)                                                                         as start_time,
    max(coalesce(t0.end_time, t0.start_time))                                                  as end_time,
    anyLast(t0.name)                                                                           as name,

    -- Metadata properties
    minMap(t0.metadata)                                                                        as metadata,
    anyLast(t0.user_id)                                                                        as user_id,
    anyLast(t0.session_id)                                                                     as session_id,
    anyLast(t0.environment)                                                                    as environment,
    groupUniqArrayArray(t0.tags)                                                               as tags,
    anyLast(t0.version)                                                                        as version,
    anyLast(t0.release)                                                                        as release,

    -- UI properties
    argMaxState(t0.bookmarked, if(t0.bookmarked is not null, t0.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(t0.public, if(t0.public is not null, t0.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(t0.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(t0.score_ids)                                                          as score_ids,
    sumMap(t0.cost_details)                                                                    as cost_details,
    sumMap(t0.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(t0.input, if(t0.input <> '', t0.event_ts, toDateTime64(0, 3)))                 as input,
    argMaxState(t0.output, if(t0.output <> '', t0.event_ts, toDateTime64(0, 3)))               as output,

    min(t0.created_at)                                                                         as created_at,
    max(t0.updated_at)                                                                         as updated_at
FROM traces_mt t0
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
       -- Identify differences between tables
       t.timestamp != a.start_time                AS timestamp_diff,
       t.name != a.name                           AS name_diff,
       t.user_id != a.user_id                     AS user_id_diff,
       t.session_id != a.session_id               AS session_id_diff,
       t.release != a.release                     AS release_diff,
       t.version != a.version                     AS version_diff,
       t.public != a.public_value                 AS public_diff,
       t.bookmarked != a.bookmarked_value         AS bookmarked_diff,
       arraySort(t.tags) != arraySort(a.tags)     AS tags_diff,
       t.input != a.input_value                   AS input_diff,
       t.output != a.output_value                 AS output_diff,
       t.metadata != a.metadata                   AS metadata_diff,
       t.environment != a.environment             AS environment_diff,

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
- [ ] **getTracesBySessionId()** - `packages/shared/src/server/repositories/traces.ts:266-304`
- [ ] **getTracesIdentifierForSession()** - `packages/shared/src/server/repositories/traces.ts:642-688`
- [ ] **traceWithSessionIdExists()** - `packages/shared/src/server/repositories/traces.ts:1143-1170`

### 3. Existence Checks
- [x] **checkTraceExists()** - `packages/shared/src/server/repositories/traces.ts:73-210`
- [x] **hasAnyTrace()** - `packages/shared/src/server/repositories/traces.ts:306-356`
- [ ] **hasAnyUser()** - `packages/shared/src/server/repositories/traces.ts:763-787`

### 4. Aggregation and Analytics Queries
- [ ] **getTracesGroupedByName()** - `packages/shared/src/server/repositories/traces.ts:489-535`
- [ ] **getTracesGroupedByUsers()** - `packages/shared/src/server/repositories/traces.ts:537-597`
- [ ] **getTracesGroupedByTags()** - `packages/shared/src/server/repositories/traces.ts:605-640`
- [ ] **getTotalUserCount()** - `packages/shared/src/server/repositories/traces.ts:789-827`
- [ ] **getUserMetrics()** - `packages/shared/src/server/repositories/traces.ts:829-978`
- [ ] **getTracesTableGeneric()** - `packages/shared/src/server/services/traces-ui-table-service.ts:207++`
- [ ] **getSessionsTableGeneric()** - `packages/shared/src/server/services/sessions-ui-table-service.ts:121++`)
- [x] **generateTracesForPublicApi()** - `web/src/features/public-api/server/traces.ts:36++`

### 5. Data Export and Migration
- [ ] **getTracesForPostHog()** - `packages/shared/src/server/repositories/traces.ts:1026-1113`
- [ ] **getTracesForBlobStorageExport()** - `packages/shared/src/server/repositories/traces.ts:980-1024`

### 6. Count and Statistics Queries
- [ ] **getTraceCountsByProjectInCreationInterval()** - `packages/shared/src/server/repositories/traces.ts:358-392`
- [ ] **getTraceCountOfProjectsSinceCreationDate()** - `packages/shared/src/server/repositories/traces.ts:394-423`

### 7. Cross-Project Queries
- [ ] **getTracesByIdsForAnyProject()** - `packages/shared/src/server/repositories/traces.ts:1115-1141`
