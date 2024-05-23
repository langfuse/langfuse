-- +goose Up
CREATE TABLE traces (
    id String,
    `timestamp` DateTime64(6),
    `name` String,
    user_id String,
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
    argMax(`timestamp`, event_ts) AS `timestamp`,
    argMax(`name`, event_ts) AS `name`,
    argMax(user_id, event_ts) AS user_id,
    maxMap(metadata) AS metadata,
    argMax(release, event_ts) AS release,
    argMax(`version`, event_ts) AS `version`,
    argMax(public, event_ts) AS public,
    argMax(bookmarked, event_ts) AS bookmarked,
    groupArrayState(tags) AS tags,
    argMax(input, event_ts) AS input,
    argMax(output, event_ts) AS output,
    argMax(session_id, event_ts) AS session_id,
    argMax(created_at, event_ts) AS created_at,
    argMax(updated_at, event_ts) AS updated_at
from langfuse.traces
GROUP BY project_id,
    id;
-- +goose Down
DROP TABLE traces;
DROP VIEW traces_view;