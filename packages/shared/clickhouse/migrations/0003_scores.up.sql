CREATE TABLE scores (
    id String,
    `timestamp` DateTime64(6),
    project_id String,
    `name` String,
    `value` Nullable(Float64),
    source String,
    comment Nullable(String) CODEC(ZSTD(1)),
    trace_id String,
    observation_id Nullable(String),
    event_ts DateTime64(3),
    event_microseconds UInt32,
) ENGINE = MergeTree
ORDER BY (
        project_id,
        name,
        toUnixTimestamp(timestamp),
        id
    );
CREATE VIEW scores_view AS
SELECT id,
    project_id,
    argMax(`timestamp`, tuple(event_ts, event_microseconds)) AS `timestamp`,
    argMax(`name`, tuple(event_ts, event_microseconds)) AS `name`,
    argMax(`value`, tuple(event_ts, event_microseconds)) AS `value`,
    argMax(source, tuple(event_ts, event_microseconds)) AS source,
    argMax(comment, tuple(event_ts, event_microseconds)) AS comment,
    argMax(trace_id, tuple(event_ts, event_microseconds)) AS trace_id,
    argMax(
        observation_id,
        tuple(event_ts, event_microseconds)
    ) AS observation_id
FROM scores
GROUP BY project_id,
    id;