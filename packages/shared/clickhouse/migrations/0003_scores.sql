-- +goose Up
CREATE TABLE scores (
    id String,
    `timestamp` DateTime64(6),
    project_id String,
    `name` String,
    `value` Nullable(Float64),
    source String,
    comment Nullable(String),
    trace_id String,
    observation_id String,
    event_ts DateTime64(6)
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
    argMax(`timestamp`, event_ts) AS `timestamp`,
    argMax(`name`, event_ts) AS `name`,
    argMax(`value`, event_ts) AS `value`,
    argMax(source, event_ts) AS source,
    argMax(comment, event_ts) AS comment,
    argMax(trace_id, event_ts) AS trace_id,
    argMax(observation_id, event_ts) AS observation_id
FROM scores
GROUP BY project_id,
    id;
-- +goose Down
DROP TABLE scores;
DROP VIEW scores_view;