CREATE TABLE scores_raw (
    id String,
    `timestamp` DateTime64(6),
    project_id String,
    `name` Nullable(String),
    `value` Nullable(Float64),
    source String,
    comment Nullable(String),
    trace_id String,
    observation_id String,
    event_ts DateTime64(6)
) ENGINE = MergeTree
ORDER BY (project_id, id);
CREATE TABLE scores (
    id String,
    `timestamp` AggregateFunction(argMax, DateTime64(6), DateTime64(6)),
    project_id String,
    `name` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `value` AggregateFunction(argMax, Nullable(Float64), DateTime64(6)),
    source AggregateFunction(argMax, String, DateTime64(6)),
    comment AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    trace_id AggregateFunction(argMax, String, DateTime64(6)),
    observation_id AggregateFunction(argMax, String, DateTime64(6)),
    event_ts AggregateFunction(argMax, DateTime64(6), DateTime64(6))
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, id);
CREATE MATERIALIZED VIEW scores_mv TO scores AS
SELECT id,
    argMaxState(
        `timestamp`,
        if(
            isNotNull(`timestamp`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS `timestamp`,
    project_id,
    argMaxState(
        `name`,
        if(isNotNull(`name`), event_ts, toDateTime64(0, 6))
    ) AS `name`,
    argMaxState(
        `value`,
        if(isNotNull(`value`), event_ts, toDateTime64(0, 6))
    ) AS `value`,
    argMaxState(
        source,
        if(isNotNull(source), event_ts, toDateTime64(0, 6))
    ) AS source,
    argMaxState(
        comment,
        if(isNotNull(comment), event_ts, toDateTime64(0, 6))
    ) AS comment,
    argMaxState(
        trace_id,
        if(
            isNotNull(trace_id),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS trace_id,
    argMaxState(
        observation_id,
        if(
            isNotNull(observation_id),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS observation_id,
    argMaxState(
        event_ts,
        if(
            isNotNull(event_ts),
            event_ts,
            toDateTime64(0, 6)
        )
    ) AS event_ts
FROM scores_raw
GROUP BY id,
    project_id;
CREATE OR REPLACE VIEW scores_view AS
SELECT id,
    argMaxMerge(`timestamp`) AS timestamp,
    project_id,
    argMaxMerge(`name`) AS name,
    argMaxMerge(`value`) AS value,
    argMaxMerge(source) AS source,
    argMaxMerge(comment) AS comment,
    argMaxMerge(trace_id) AS trace_id,
    argMaxMerge(observation_id) AS observation_id,
    FROM scores
GROUP BY id,
    project_id;