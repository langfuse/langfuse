-- +goose Up
CREATE TABLE traces (
    id String,
    `timestamp` DateTime64(6),
    `name` String,
    user_id String,
    metadata Map(String, String) CODEC(ZSTD(1)),
    release Nullable(String),
    `version` Nullable(String),
    project_id String,
    public Bool,
    bookmarked Bool,
    tags Array(String),
    input Nullable(String) CODEC(ZSTD(1)),
    output Nullable(String) CODEC(ZSTD(1)),
    session_id Nullable(String),
    created_at DateTime64(6),
    updated_at DateTime64(6),
    event_ts DateTime64(3),
    event_microseconds UInt32,
) ENGINE = MergeTree PARTITION BY toDate(timestamp)
ORDER BY (
        project_id,
        name,
        user_id,
        toUnixTimestamp(timestamp),
    );
CREATE VIEW traces_view AS
SELECT id,
    project_id,
    argMax(
        if(timestamp != '', timestamp, NULL),
        tuple(event_ts, event_microseconds)
    ) AS `timestamp`,
    argMax(
        if(name != '', name, NULL),
        tuple(event_ts, event_microseconds)
    ) AS `name`,
    argMax(
        if(user_id != '', user_id, NULL),
        tuple(event_ts, event_microseconds)
    ) AS user_id,
    maxMap(metadata) AS metadata,
    argMax(release, tuple(event_ts, event_microseconds)) AS release,
    argMax(`version`, tuple(event_ts, event_microseconds)) AS `version`,
    argMax(public, tuple(event_ts, event_microseconds)) AS public,
    argMax(bookmarked, tuple(event_ts, event_microseconds)) AS bookmarked,
    arrayDistinct(flatten(groupArray(tags))) AS tags,
    argMax(input, tuple(event_ts, event_microseconds)) AS input,
    argMax(output, tuple(event_ts, event_microseconds)) AS output,
    argMax(session_id, tuple(event_ts, event_microseconds)) AS session_id,
    argMax(created_at, tuple(event_ts, event_microseconds)) AS created_at,
    argMax(updated_at, tuple(event_ts, event_microseconds)) AS updated_at
from langfuse.traces
GROUP BY project_id,
    id;
-- +goose Down
DROP TABLE traces;
DROP VIEW traces_view;