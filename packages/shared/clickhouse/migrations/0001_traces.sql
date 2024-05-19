-- +goose Up
CREATE TABLE traces_raw (
    id String,
    `timestamp` DateTime64(6),
    `name` Nullable(String),
    user_id Nullable(String),
    metadata Map(String, String),
    release Nullable(String),
    `version` Nullable(String),
    project_id String,
    public Bool,
    bookmarked Bool,
    tags Array(String),
    input Nullable(String),
    output Nullable(String),
    session_id Nullable(String),
    created_at DateTime64(6),
    updated_at DateTime64(6),
    event_ts DateTime64(6)
) ENGINE = MergeTree
ORDER BY (project_id, id);
CREATE TABLE traces (
    id String,
    `timestamp` AggregateFunction(argMax, DateTime64(6), DateTime64(6)),
    `name` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    user_id AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    metadata SimpleAggregateFunction(maxMap, Map(String, String)),
    release AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `version` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    project_id String,
    `public` AggregateFunction(argMax, Bool, DateTime64(6)),
    bookmarked AggregateFunction(argMax, Bool, DateTime64(6)),
    tags AggregateFunction(groupArray, Array(String)),
    input AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    output AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    session_id AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    created_at AggregateFunction(argMax, DateTime64(6), DateTime64(6)),
    updated_at AggregateFunction(argMax, DateTime64(6), DateTime64(6))
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, id);
CREATE MATERIALIZED VIEW traces_mv TO traces AS
SELECT id,
    argMaxState(
        `timestamp`,
        if(
            isNotNull(`timestamp`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS `timestamp`,
    argMaxState(
        `name`,
        if(isNotNull(`name`), event_ts, toDateTime64(0, 6))
    ) AS `name`,
    argMaxState(
        user_id,
        if(isNotNull(user_id), event_ts, toDateTime64(0, 6))
    ) AS user_id,
    maxMap(metadata) as metadata,
    argMaxState(
        release,
        if(isNotNull(release), event_ts, toDateTime64(0, 6))
    ) AS release,
    argMaxState(
        `version`,
        if(
            isNotNull(`version`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS `version`,
    project_id,
    argMaxState(
        `public`,
        if(
            isNotNull(`public`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS `public`,
    argMaxState(
        bookmarked,
        if(
            isNotNull(bookmarked),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS bookmarked,
    groupArrayState(tags) AS tags,
    argMaxState(
        input,
        if(isNotNull(input), event_ts, toDateTime64(0, 6))
    ) AS input,
    argMaxState(
        output,
        if(isNotNull(output), event_ts, toDateTime64(0, 6))
    ) AS output,
    argMaxState(
        session_id,
        if(
            isNotNull(session_id),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS session_id,
    argMaxState(
        created_at,
        if(
            isNotNull(created_at),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS created_at,
    argMaxState(
        updated_at,
        if(
            isNotNull(updated_at),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS updated_at
FROM traces_raw
GROUP BY project_id,
    id;
CREATE OR REPLACE VIEW traces_view AS
SELECT id,
    argMaxMerge(`timestamp`) AS timestamp,
    argMaxMerge(`name`) AS name,
    argMaxMerge(user_id) AS user_id,
    maxMap(metadata),
    argMaxMerge(release) AS release,
    argMaxMerge(`version`) AS version,
    project_id,
    argMaxMerge(`public`) AS public,
    argMaxMerge(bookmarked) AS bookmarked,
    flatten(groupArrayMerge(tags)) AS tags,
    argMaxMerge(input) AS input,
    argMaxMerge(output) AS output,
    argMaxMerge(session_id) AS session_id,
    argMaxMerge(created_at) AS created_at,
    argMaxMerge(updated_at) AS updated_at
FROM traces
GROUP BY project_id,
    id;
-- +goose Down
DROP TABLE traces_raw;
DROP TABLE traces;
DROP TABLE traces_mv;
DROP VIEW traces_view;