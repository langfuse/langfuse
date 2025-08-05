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