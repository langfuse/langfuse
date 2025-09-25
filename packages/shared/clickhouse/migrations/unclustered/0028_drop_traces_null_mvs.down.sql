-- Recreate materialized views derived from traces_null table
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

    -- Aggregations -- DO NOT USE
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

    -- Aggregations -- DO NOT USE
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

    -- Aggregations -- DO NOT USE
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