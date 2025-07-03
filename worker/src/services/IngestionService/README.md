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
    `name`            String,

    -- Metadata properties
    `metadata`        Map(LowCardinality(String), String),
    `user_id`         String,
    `session_id`      String,
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
    `start_time`         SimpleAggregateFunction(min, DateTime64(3)),
    `end_time`           SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `name_argmax`        AggregateFunction(argMax, String, DateTime64(3)),
    `name`               SimpleAggregateFunction(anyLast, String),

    -- Metadata properties
    -- Metadata takes the last seen value in this form.
    -- If we spread it across multiple rows (keys + values) we might be able to allow updates/overwrites.
    -- Indexing speed in this case is unclear though.
    `metadata_argmax`    AggregateFunction(argMax, Map(LowCardinality(String), String), DateTime64(3)),
    `metadata`           SimpleAggregateFunction(anyLast, Map(String, String)),
    `user_id_argmax`     AggregateFunction(argMax, String, DateTime64(3)),
    `session_id_argmax`  AggregateFunction(argMax, String, DateTime64(3)),
    `environment_argmax` AggregateFunction(argMax, String, DateTime64(3)),
    `user_id`            SimpleAggregateFunction(anyLast, String),
    `session_id`         SimpleAggregateFunction(anyLast, String),
    `environment`        SimpleAggregateFunction(anyLast, String),
    `tags`               SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `version`            AggregateFunction(argMax, Nullable(String), DateTime64(3)),
    `release`            AggregateFunction(argMax, Nullable(String), DateTime64(3)),

    -- UI properties
    `bookmarked`         AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),
    `public`             AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),

    -- Aggregations
    `observation_ids`    SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `score_ids`          SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details`       SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `usage_details`      SimpleAggregateFunction(sumMap, Map(String, UInt64)),

    -- Input/Output
    `input_argmax`       AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `output_argmax`      AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `input`              SimpleAggregateFunction(anyLast, String),
    `output`             SimpleAggregateFunction(anyLast, String),

    `created_at`         SimpleAggregateFunction(min, DateTime64(3)),
    `updated_at`         SimpleAggregateFunction(max, DateTime64(3)),

    -- Indexes
    INDEX idx_environment environment TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1
) Engine = AggregatingMergeTree()
      ORDER BY (project_id, id);

-- Create materialized view for all_amt
-- Create the materialized view for unclustered deployment:
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_all_amt_mv TO traces_all_amt AS
SELECT
    -- Identifiers
    t0.project_id                                                                              as project_id,
    t0.id                                                                                      as id,
    min(t0.start_time)                                                                         as start_time,
    max(coalesce(t0.end_time, t0.start_time))                                                  as end_time,
    argMaxState(t0.name, if(t0.name <> '', t0.event_ts, toDateTime64(0, 3)))                   as name_argmax,
    anyLast(t0.name)                                                                           as name,

    -- Metadata properties
    argMaxState(t0.metadata, if(t0.metadata <> '{}', t0.event_ts, toDateTime64(0,3)))          as metadata_argmax,
    anyLastMap(t0.metadata)                                                                    as metadata,
    argMaxState(t0.user_id, if(t0.user_id <> '', t0.event_ts, toDateTime64(0, 3)))             as user_id_argmax,
    argMaxState(t0.session_id, if(t0.session_id <> '', t0.event_ts, toDateTime64(0, 3)))       as session_id_argmax,
    argMaxState(t0.environment, if(t0.environment <> '', t0.event_ts, toDateTime64(0, 3)))     as environment_argmax,
    anyLast(t0.user_id)                                                                        as user_id,
    anyLast(t0.session_id)                                                                     as session_id,
    anyLast(t0.environment)                                                                    as environment,
    groupUniqArrayArray(t0.tags)                                                               as tags,
    argMaxState(t0.version, if(t0.version <> '', t0.event_ts, toDateTime64(0, 3)))             as version,
    argMaxState(t0.release, if(t0.release <> '', t0.event_ts, toDateTime64(0, 3)))             as release,

    -- UI properties
    argMaxState(t0.bookmarked, if(t0.bookmarked is not null, t0.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(t0.public, if(t0.public is not null, t0.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(t0.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(t0.score_ids)                                                          as score_ids,
    sumMap(t0.cost_details)                                                                    as cost_details,
    sumMap(t0.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(t0.input, if(t0.input <> '', t0.event_ts, toDateTime64(0, 3)))                 as input_argmax,
    argMaxState(t0.output, if(t0.output <> '', t0.event_ts, toDateTime64(0, 3)))               as output_argmax,
    anyLast(input)                                                                             as input,
    anyLast(output)                                                                            as output,

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
    `start_time`         SimpleAggregateFunction(min, DateTime64(3)),
    `end_time`           SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `name_argmax`        AggregateFunction(argMax, String, DateTime64(3)),
    `name`               SimpleAggregateFunction(anyLast, String),

    -- Metadata properties
    `metadata_argmax`    AggregateFunction(argMax, Map(LowCardinality(String), String), DateTime64(3)),
    `metadata`           SimpleAggregateFunction(anyLast, Map(String, String)),
    `user_id_argmax`     AggregateFunction(argMax, String, DateTime64(3)),
    `session_id_argmax`  AggregateFunction(argMax, String, DateTime64(3)),
    `environment_argmax` AggregateFunction(argMax, String, DateTime64(3)),
    `user_id`            SimpleAggregateFunction(anyLast, String),
    `session_id`         SimpleAggregateFunction(anyLast, String),
    `environment`        SimpleAggregateFunction(anyLast, String),
    `tags`               SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `version`            AggregateFunction(argMax, Nullable(String), DateTime64(3)),
    `release`            AggregateFunction(argMax, Nullable(String), DateTime64(3)),

    -- UI properties
    `bookmarked`         AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),
    `public`             AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),

    -- Aggregations
    `observation_ids`    SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `score_ids`          SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details`       SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `usage_details`      SimpleAggregateFunction(sumMap, Map(String, UInt64)),

    -- Input/Output
    `input_argmax`       AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `output_argmax`      AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `input`              SimpleAggregateFunction(anyLast, String),
    `output`             SimpleAggregateFunction(anyLast, String),

    `created_at`         SimpleAggregateFunction(min, DateTime64(3)),
    `updated_at`         SimpleAggregateFunction(max, DateTime64(3)),

    -- Indexes
    INDEX idx_environment environment TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1
) Engine = AggregatingMergeTree()
    ORDER BY (project_id, id)
    TTL toDate(start_time) + INTERVAL 7 DAY;

-- Create materialized view for 7d_amt
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_7d_amt_mv TO traces_7d_amt AS
SELECT
    -- Identifiers
    t0.project_id                                                                              as project_id,
    t0.id                                                                                      as id,
    min(t0.start_time)                                                                         as start_time,
    max(coalesce(t0.end_time, t0.start_time))                                                  as end_time,
    argMaxState(t0.name, if(t0.name <> '', t0.event_ts, toDateTime64(0, 3)))                   as name_argmax,
    anyLast(t0.name)                                                                           as name,

    -- Metadata properties
    argMaxState(t0.metadata, if(t0.metadata <> '{}', t0.event_ts, toDateTime64(0,3)))          as metadata_argmax,
    anyLastMap(t0.metadata)                                                                    as metadata,
    argMaxState(t0.user_id, if(t0.user_id <> '', t0.event_ts, toDateTime64(0, 3)))             as user_id_argmax,
    argMaxState(t0.session_id, if(t0.session_id <> '', t0.event_ts, toDateTime64(0, 3)))       as session_id_argmax,
    argMaxState(t0.environment, if(t0.environment <> '', t0.event_ts, toDateTime64(0, 3)))     as environment_argmax,
    anyLast(t0.user_id)                                                                        as user_id,
    anyLast(t0.session_id)                                                                     as session_id,
    anyLast(t0.environment)                                                                    as environment,
    groupUniqArrayArray(t0.tags)                                                               as tags,
    argMaxState(t0.version, if(t0.version <> '', t0.event_ts, toDateTime64(0, 3)))             as version,
    argMaxState(t0.release, if(t0.release <> '', t0.event_ts, toDateTime64(0, 3)))             as release,

    -- UI properties
    argMaxState(t0.bookmarked, if(t0.bookmarked is not null, t0.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(t0.public, if(t0.public is not null, t0.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(t0.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(t0.score_ids)                                                          as score_ids,
    sumMap(t0.cost_details)                                                                    as cost_details,
    sumMap(t0.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(t0.input, if(t0.input <> '', t0.event_ts, toDateTime64(0, 3)))                 as input_argmax,
    argMaxState(t0.output, if(t0.output <> '', t0.event_ts, toDateTime64(0, 3)))               as output_argmax,
    anyLast(input)                                                                             as input,
    anyLast(output)                                                                            as output,

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
    `start_time`         SimpleAggregateFunction(min, DateTime64(3)),
    `end_time`           SimpleAggregateFunction(max, Nullable(DateTime64(3))),
    `name_argmax`        AggregateFunction(argMax, String, DateTime64(3)),
    `name`               SimpleAggregateFunction(anyLast, String),

    -- Metadata properties
    `metadata_argmax`    AggregateFunction(argMax, Map(LowCardinality(String), String), DateTime64(3)),
    `metadata`           SimpleAggregateFunction(anyLast, Map(String, String)),
    `user_id_argmax`     AggregateFunction(argMax, String, DateTime64(3)),
    `session_id_argmax`  AggregateFunction(argMax, String, DateTime64(3)),
    `environment_argmax` AggregateFunction(argMax, String, DateTime64(3)),
    `user_id`            SimpleAggregateFunction(anyLast, String),
    `session_id`         SimpleAggregateFunction(anyLast, String),
    `environment`        SimpleAggregateFunction(anyLast, String),
    `tags`               SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `version`            AggregateFunction(argMax, Nullable(String), DateTime64(3)),
    `release`            AggregateFunction(argMax, Nullable(String), DateTime64(3)),

    -- UI properties
    `bookmarked`         AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),
    `public`             AggregateFunction(argMax, Nullable(Bool), DateTime64(3)),

    -- Aggregations
    `observation_ids`    SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `score_ids`          SimpleAggregateFunction(groupUniqArrayArray, Array(String)),
    `cost_details`       SimpleAggregateFunction(sumMap, Map(String, Decimal(38, 12))),
    `usage_details`      SimpleAggregateFunction(sumMap, Map(String, UInt64)),

    -- Input/Output
    `input_argmax`       AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `output_argmax`      AggregateFunction(argMax, String, DateTime64(3)) CODEC (ZSTD(3)),
    `input`              SimpleAggregateFunction(anyLast, String),
    `output`             SimpleAggregateFunction(anyLast, String),

    `created_at`         SimpleAggregateFunction(min, DateTime64(3)),
    `updated_at`         SimpleAggregateFunction(max, DateTime64(3)),

    -- Indexes
    INDEX idx_environment environment TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1
) Engine = AggregatingMergeTree()
    ORDER BY (project_id, id)
    TTL toDate(start_time) + INTERVAL 30 DAY;

-- Create materialized view for 30d_amt
CREATE MATERIALIZED VIEW IF NOT EXISTS traces_30d_amt_mv TO traces_30d_amt AS
SELECT
    -- Identifiers
    t0.project_id                                                                              as project_id,
    t0.id                                                                                      as id,
    min(t0.start_time)                                                                         as start_time,
    max(coalesce(t0.end_time, t0.start_time))                                                  as end_time,
    argMaxState(t0.name, if(t0.name <> '', t0.event_ts, toDateTime64(0, 3)))                   as name_argmax,
    anyLast(t0.name)                                                                           as name,

    -- Metadata properties
    argMaxState(t0.metadata, if(t0.metadata <> '{}', t0.event_ts, toDateTime64(0,3)))          as metadata_argmax,
    anyLastMap(t0.metadata)                                                                    as metadata,
    argMaxState(t0.user_id, if(t0.user_id <> '', t0.event_ts, toDateTime64(0, 3)))             as user_id_argmax,
    argMaxState(t0.session_id, if(t0.session_id <> '', t0.event_ts, toDateTime64(0, 3)))       as session_id_argmax,
    argMaxState(t0.environment, if(t0.environment <> '', t0.event_ts, toDateTime64(0, 3)))     as environment_argmax,
    anyLast(t0.user_id)                                                                        as user_id,
    anyLast(t0.session_id)                                                                     as session_id,
    anyLast(t0.environment)                                                                    as environment,
    groupUniqArrayArray(t0.tags)                                                               as tags,
    argMaxState(t0.version, if(t0.version <> '', t0.event_ts, toDateTime64(0, 3)))             as version,
    argMaxState(t0.release, if(t0.release <> '', t0.event_ts, toDateTime64(0, 3)))             as release,

    -- UI properties
    argMaxState(t0.bookmarked, if(t0.bookmarked is not null, t0.event_ts, toDateTime64(0, 3))) as bookmarked,
    argMaxState(t0.public, if(t0.public is not null, t0.event_ts, toDateTime64(0, 3)))         as public,

    -- Aggregations
    groupUniqArrayArray(t0.observation_ids)                                                    as observation_ids,
    groupUniqArrayArray(t0.score_ids)                                                          as score_ids,
    sumMap(t0.cost_details)                                                                    as cost_details,
    sumMap(t0.usage_details)                                                                   as usage_details,

    -- Input/Output
    argMaxState(t0.input, if(t0.input <> '', t0.event_ts, toDateTime64(0, 3)))                 as input_argmax,
    argMaxState(t0.output, if(t0.output <> '', t0.event_ts, toDateTime64(0, 3)))               as output_argmax,
    anyLast(input)                                                                             as input,
    anyLast(output)                                                                            as output,

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
    finalizeAggregation(name_argmax) AS name_argmax_value,
    name,

    -- Metadata properties
    finalizeAggregation(metadata) AS metadata_value,
    finalizeAggregation(user_id_argmax) AS user_id_argmax_value,
    finalizeAggregation(session_id_argmax) AS session_id_argmax_value,
    finalizeAggregation(environment_argmax) AS environment_argmax_value,
    user_id,
    session_id,
    environment,
    tags,
    finalizeAggregation(version) AS version_value,
    finalizeAggregation(release) AS release_value,

    -- UI properties
    finalizeAggregation(bookmarked) AS bookmarked_value,
    finalizeAggregation(public) AS public_value,

    -- Aggregations
    observation_ids,
    score_ids,
    cost_details,
    usage_details,

    -- Input/Output
    finalizeAggregation(input_argmax) AS input_argmax_value,
    finalizeAggregation(output_argmax) AS output_argmax_value,
    input,
    output,

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
           finalizeAggregation(name_argmax)        AS name_argmax_value,
           name                                    AS name_anylast_value,

           finalizeAggregation(metadata_argmax)    AS metadata_argmax_value,
           metadata                                AS metadata_anylast_value,
           finalizeAggregation(user_id_argmax)     AS user_id_argmax_value,
           user_id                                 AS user_id_anylast_value,
           finalizeAggregation(session_id_argmax)  AS session_id_argmax_value,
           session_id                              AS session_id_anylast_value,
           finalizeAggregation(environment_argmax) AS environment_argmax_value,
           environment                             AS environment_anylast_value,
           tags,
           finalizeAggregation(version)            AS version_value,
           finalizeAggregation(release)            AS release_value,

           finalizeAggregation(bookmarked)         AS bookmarked_value,
           finalizeAggregation(public)             AS public_value,

           finalizeAggregation(input_argmax)       AS input_argmax_value,
           input                                   AS input_anylast_value,
           finalizeAggregation(output_argmax)      AS output_argmax_value,
           output                                  AS output_anylast_value,

           created_at,
           updated_at
    FROM traces_all_amt
)

-- Main query to compare AMT with original traces table
SELECT t.project_id,
       t.id,
       -- Identify differences between tables
       t.timestamp != a.start_time                AS timestamp_diff,
       t.name != a.name_anylast_value             AS name_diff,
       t.user_id != a.user_id_anylast_value       AS user_id_diff,
       t.session_id != a.session_id_anylast_value AS session_id_diff,
       t.release != a.release_value               AS release_diff,
       t.version != a.version_value               AS version_diff,
       t.public != a.public_value                 AS public_diff,
       t.bookmarked != a.bookmarked_value         AS bookmarked_diff,
       arraySort(t.tags) != arraySort(a.tags)     AS tags_diff,
       t.input != a.input_anylast_value           AS input_diff,
       t.output != a.output_anylast_value         AS output_diff,
       t.metadata != a.metadata_anylast_value     AS metadata_diff,
       
       a.name_argmax_value != a.name_anylast_value AS amt_name_diff,
       a.user_id_argmax_value != a.user_id_anylast_value AS amt_user_id_diff,
       a.session_id_argmax_value != a.session_id_anylast_value AS amt_session_id_diff,
       a.environment_argmax_value != a.environment_anylast_value AS amt_environment_diff,
       a.input_argmax_value != a.input_anylast_value AS amt_input_diff,
       a.output_argmax_value != a.output_anylast_value AS amt_output_diff,
       a.metadata_argmax_value != a.metadata_anylast_value AS amt_metadata_diff,

       -- Include original values for comparison
       t.timestamp                                AS traces_timestamp,
       a.start_time                               AS amt_start_time,
       t.name                                     AS traces_name,
       a.name_anylast_value                       AS amt_name_anylast,
       a.name_argmax_value                        AS amt_name_argmax,
       t.user_id                                  AS traces_user_id,
       a.user_id_anylast_value                    AS amt_user_id_anylast,
       a.user_id_argmax_value                     AS amt_user_id_argmax,
       t.session_id                               AS traces_session_id,
       a.session_id_anylast_value                 AS amt_session_id_anylast,
       a.session_id_argmax_value                  AS amt_session_id_argmax,
       t.environment                              AS traces_environment,
       a.environment_anylast_value                AS amt_environment_anylast,
       a.environment_argmax_value                 AS amt_environment_argmax,

       t.metadata                                 AS traces_metadata,
       a.metadata_anylast_value                   AS amt_metadata_anylast,
       a.metadata_argmax_value                    AS amt_metadata_argmax,
       arraySort(t.tags)                          AS traces_tags,
       arraySort(a.tags)                          AS amt_tags,
       t.bookmarked                               AS traces_bookmarked,
       a.bookmarked_value                         AS amt_bookmarked,
       t.public                                   AS traces_public,
       a.public_value                             AS amt_public,
       t.release                                  AS traces_release,
       a.release_value                            AS amt_release,
       t.version                                  AS traces_version,
       a.version_value                            AS amt_version,

       t.input                                    AS traces_input,
       a.input_anylast_value                      AS amt_input_anylast,
       a.input_argmax_value                       AS amt_input_argmax,
       t.output                                   AS traces_output,
       a.output_anylast_value                     AS amt_output_anylast,
       a.output_argmax_value                      AS amt_output_argmax,

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
       metadata_diff
           AS total_diff

FROM traces t FINAL
LEFT JOIN amt_data a ON t.project_id = a.project_id AND t.id = a.id
where (t.timestamp >= '2025-07-01'
or a.start_time >= '2025-07-01')
and t.project_id in (
  'some-project-id'
)
ORDER BY total_diff desc
LIMIT 1000;
```