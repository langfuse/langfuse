-- +goose Up
CREATE TABLE observations (
    `id` String,
    `trace_id` String,
    `project_id` String,
    `type` Nullable(String),
    `parent_observation_id` Nullable(String),
    `created_at` DateTime64(6),
    `start_time` DateTime64(6),
    `end_time` Nullable(DateTime64(6)),
    `name` String,
    metadata Map(String, String) CODEC(ZSTD(1)),
    `user_id` Nullable(String),
    `level` Nullable(String),
    `status_message` Nullable(String),
    `version` Nullable(String),
    `input` Nullable(String) CODEC(ZSTD(1)),
    `output` Nullable(String) CODEC(ZSTD(1)),
    `model` Nullable(String),
    `internal_model` Nullable(String),
    `model_parameters` Nullable(String),
    `prompt_tokens` Nullable(Int32),
    `completion_tokens` Nullable(Int32),
    `total_tokens` Nullable(Int32),
    `unit` Nullable(String),
    `input_cost` Nullable(Float64),
    `output_cost` Nullable(Float64),
    `total_cost` Nullable(Float64),
    `completion_start_time` Nullable(DateTime64(6)),
    `prompt_id` Nullable(String),
    event_ts DateTime64(3),
    event_microseconds UInt32,
) ENGINE = MergeTree PARTITION BY toDate(event_ts)
ORDER BY (
        project_id,
        `name`,
        toUnixTimestamp(start_time),
        trace_id,
        id
    );
CREATE VIEW observations_view AS
SELECT id,
    project_id,
    argMax(`trace_id`, tuple(event_ts, event_microseconds)) AS `trace_id`,
    argMax(`type`, tuple(event_ts, event_microseconds)) AS `type`,
    argMax(
        `parent_observation_id`,
        tuple(event_ts, event_microseconds)
    ) AS `parent_observation_id`,
    argMax(
        `created_at`,
        tuple(event_ts, event_microseconds)
    ) AS `created_at`,
    argMax(
        if(start_time != '', start_time, NULL),
        tuple(event_ts, event_microseconds)
    ) AS `start_time`,
    argMax(`end_time`, tuple(event_ts, event_microseconds)) AS `end_time`,
    argMax(
        if(`name` != '', `name`, NULL),
        tuple(event_ts, event_microseconds)
    ) AS `name`,
    maxMap(metadata) AS metadata,
    argMax(`user_id`, tuple(event_ts, event_microseconds)) AS `user_id`,
    argMax(`level`, tuple(event_ts, event_microseconds)) AS `level`,
    argMax(
        `status_message`,
        tuple(event_ts, event_microseconds)
    ) AS `status_message`,
    argMax(`version`, tuple(event_ts, event_microseconds)) AS `version`,
    argMax(`input`, tuple(event_ts, event_microseconds)) AS `input`,
    argMax(`output`, tuple(event_ts, event_microseconds)) AS `output`,
    argMax(`model`, tuple(event_ts, event_microseconds)) AS `model`,
    argMax(
        `internal_model`,
        tuple(event_ts, event_microseconds)
    ) AS `internal_model`,
    argMax(
        `model_parameters`,
        tuple(event_ts, event_microseconds)
    ) AS `model_parameters`,
    argMax(
        `prompt_tokens`,
        tuple(event_ts, event_microseconds)
    ) AS `prompt_tokens`,
    argMax(
        `completion_tokens`,
        tuple(event_ts, event_microseconds)
    ) AS `completion_tokens`,
    argMax(
        `total_tokens`,
        tuple(event_ts, event_microseconds)
    ) AS `total_tokens`,
    argMax(`unit`, tuple(event_ts, event_microseconds)) AS `unit`,
    argMax(
        `input_cost`,
        tuple(event_ts, event_microseconds)
    ) AS `input_cost`,
    argMax(
        `output_cost`,
        tuple(event_ts, event_microseconds)
    ) AS `output_cost`,
    argMax(
        `total_cost`,
        tuple(event_ts, event_microseconds)
    ) AS `total_cost`,
    argMax(
        `completion_start_time`,
        tuple(event_ts, event_microseconds)
    ) AS `completion_start_time`,
    argMax(`prompt_id`, tuple(event_ts, event_microseconds)) AS `prompt_id`
FROM observations
GROUP BY project_id,
    id;
-- +goose Down
DROP TABLE observations;
DROP VIEW observations_view;