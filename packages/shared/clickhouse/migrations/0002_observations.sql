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
    metadata Map(String, String),
    `user_id` Nullable(String),
    `level` Nullable(String),
    `status_message` Nullable(String),
    `version` Nullable(String),
    `input` Nullable(String),
    `output` Nullable(String),
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
    event_ts DateTime64(6)
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
    argMax(`trace_id`, event_ts) AS `trace_id`,
    argMax(`type`, event_ts) AS `type`,
    argMax(`parent_observation_id`, event_ts) AS `parent_observation_id`,
    argMax(`created_at`, event_ts) AS `created_at`,
    argMax(`start_time`, event_ts) AS `start_time`,
    argMax(`end_time`, event_ts) AS `end_time`,
    argMax(`name`, event_ts) AS `name`,
    maxMap(metadata) AS metadata,
    argMax(`user_id`, event_ts) AS `user_id`,
    argMax(`level`, event_ts) AS `level`,
    argMax(`status_message`, event_ts) AS `status_message`,
    argMax(`version`, event_ts) AS `version`,
    argMax(`input`, event_ts) AS `input`,
    argMax(`output`, event_ts) AS `output`,
    argMax(`model`, event_ts) AS `model`,
    argMax(`internal_model`, event_ts) AS `internal_model`,
    argMax(`model_parameters`, event_ts) AS `model_parameters`,
    argMax(`prompt_tokens`, event_ts) AS `prompt_tokens`,
    argMax(`completion_tokens`, event_ts) AS `completion_tokens`,
    argMax(`total_tokens`, event_ts) AS `total_tokens`,
    argMax(`unit`, event_ts) AS `unit`,
    argMax(`input_cost`, event_ts) AS `input_cost`,
    argMax(`output_cost`, event_ts) AS `output_cost`,
    argMax(`total_cost`, event_ts) AS `total_cost`,
    argMax(`completion_start_time`, event_ts) AS `completion_start_time`,
    argMax(`prompt_id`, event_ts) AS `prompt_id`
FROM observations
GROUP BY project_id,
    id;
-- +goose Down
DROP TABLE observations;
DROP VIEW observations_view;