-- +goose Up
CREATE TABLE observations_raw (
    `id` String,
    `trace_id` Nullable(String),
    `project_id` String,
    `type` Nullable(String),
    `parent_observation_id` Nullable(String),
    `created_at` DateTime64(6),
    `start_time` Nullable(DateTime64(6)),
    `end_time` Nullable(DateTime64(6)),
    `name` Nullable(String),
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
) ENGINE = MergeTree
ORDER BY (project_id, id);
CREATE TABLE observations (
    `id` String,
    `trace_id` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `project_id` String,
    `type` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `parent_observation_id` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `created_at` AggregateFunction(argMax, DateTime64(6), DateTime64(6)),
    `start_time` AggregateFunction(argMax, Nullable(DateTime64(6)), DateTime64(6)),
    `end_time` AggregateFunction(argMax, Nullable(DateTime64(6)), DateTime64(6)),
    `name` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    metadata SimpleAggregateFunction(maxMap, Map(String, String)),
    `user_id` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `level` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `status_message` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `version` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `input` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `output` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `model` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `internal_model` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `model_parameters` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `prompt_tokens` AggregateFunction(argMax, Nullable(Int32), DateTime64(6)),
    `completion_tokens` AggregateFunction(argMax, Nullable(Int32), DateTime64(6)),
    `total_tokens` AggregateFunction(argMax, Nullable(Int32), DateTime64(6)),
    `unit` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
    `input_cost` AggregateFunction(argMax, Nullable(Float64), DateTime64(6)),
    `output_cost` AggregateFunction(argMax, Nullable(Float64), DateTime64(6)),
    `total_cost` AggregateFunction(argMax, Nullable(Float64), DateTime64(6)),
    `completion_start_time` AggregateFunction(argMax, Nullable(DateTime64(6)), DateTime64(6)),
    `prompt_id` AggregateFunction(argMax, Nullable(String), DateTime64(6)),
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, id);
CREATE MATERIALIZED VIEW observations_mv TO observations AS
SELECT id,
    argMaxState(
        `trace_id`,
        if(
            isNotNull(`trace_id`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `trace_id`,
    project_id,
    argMaxState(
        `type`,
        if(isNotNull(`type`), event_ts, toDateTime64(0, 6))
    ) as `type`,
    argMaxState(
        `parent_observation_id`,
        if(
            isNotNull(`parent_observation_id`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `parent_observation_id`,
    argMaxState(
        `created_at`,
        if(
            isNotNull(`created_at`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `created_at`,
    argMaxState(
        `start_time`,
        if(
            isNotNull(`start_time`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `start_time`,
    argMaxState(
        `end_time`,
        if(
            isNotNull(`end_time`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `end_time`,
    argMaxState(
        `name`,
        if(isNotNull(`name`), event_ts, toDateTime64(0, 6))
    ) as `name`,
    maxMap(metadata),
    argMaxState(
        `user_id`,
        if(
            isNotNull(`user_id`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `user_id`,
    argMaxState(
        `level`,
        if(isNotNull(`level`), event_ts, toDateTime64(0, 6))
    ) as `level`,
    argMaxState(
        `status_message`,
        if(
            isNotNull(`status_message`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `status_message`,
    argMaxState(
        `version`,
        if(
            isNotNull(`version`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `version`,
    argMaxState(
        `input`,
        if(isNotNull(`input`), event_ts, toDateTime64(0, 6))
    ) as `input`,
    argMaxState(
        `output`,
        if(
            isNotNull(`output`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `output`,
    argMaxState(
        `model`,
        if(isNotNull(`model`), event_ts, toDateTime64(0, 6))
    ) as `model`,
    argMaxState(
        `internal_model`,
        if(
            isNotNull(`internal_model`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `internal_model`,
    argMaxState(
        `model_parameters`,
        if(
            isNotNull(`model_parameters`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `model_parameters`,
    argMaxState(
        `prompt_tokens`,
        if(
            isNotNull(`prompt_tokens`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `prompt_tokens`,
    argMaxState(
        `completion_tokens`,
        if(
            isNotNull(`completion_tokens`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `completion_tokens`,
    argMaxState(
        `total_tokens`,
        if(
            isNotNull(`total_tokens`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `total_tokens`,
    argMaxState(
        `unit`,
        if(isNotNull(`unit`), event_ts, toDateTime64(0, 6))
    ) as `unit`,
    argMaxState(
        `input_cost`,
        if(
            isNotNull(`input_cost`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `input_cost`,
    argMaxState(
        `output_cost`,
        if(
            isNotNull(`output_cost`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `output_cost`,
    argMaxState(
        `total_cost`,
        if(
            isNotNull(`total_cost`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `total_cost`,
    argMaxState(
        `completion_start_time`,
        if(
            isNotNull(`completion_start_time`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `completion_start_time`,
    argMaxState(
        `prompt_id`,
        if(
            isNotNull(`prompt_id`),
            event_ts,
            toDateTime64(0, 6)
        )
    ) as `prompt_id`
FROM observations_raw
GROUP BY id,
    project_id;
CREATE OR REPLACE VIEW observations_view AS
SELECT `id`,
    argMaxMerge(`trace_id`) AS trace_id,
    project_id,
    argMaxMerge(`type`) AS type,
    argMaxMerge(`parent_observation_id`) AS parent_observation_id,
    argMaxMerge(`created_at`) AS created_at,
    argMaxMerge(`start_time`) AS start_time,
    argMaxMerge(`end_time`) AS end_time,
    argMaxMerge(`name`) AS name,
    maxMap(metadata) AS metadata,
    argMaxMerge(`user_id`) AS user_id,
    argMaxMerge(`level`) AS level,
    argMaxMerge(`status_message`) AS status_message,
    argMaxMerge(`version`) AS version,
    argMaxMerge(`input`) AS input,
    argMaxMerge(`output`) AS output,
    argMaxMerge(`model`) AS model,
    argMaxMerge(`internal_model`) AS internal_model,
    argMaxMerge(`model_parameters`) AS model_parameters,
    argMaxMerge(`prompt_tokens`) AS prompt_tokens,
    argMaxMerge(`completion_tokens`) AS completion_tokens,
    argMaxMerge(`total_tokens`) AS total_tokens,
    argMaxMerge(`unit`) AS unit,
    argMaxMerge(`input_cost`) AS input_cost,
    argMaxMerge(`output_cost`) AS output_cost,
    argMaxMerge(`total_cost`) AS total_cost,
    argMaxMerge(`completion_start_time`) AS completion_start_time,
    argMaxMerge(`prompt_id`) AS prompt_id
FROM observations
GROUP BY id,
    project_id;
-- +goose Down
DROP TABLE observations_raw;
DROP TABLE observations;
DROP TABLE observations_mv;
DROP VIEW observations_view;