
-- ReplacingMergeTree does not work here as values for sorted columns might change with updates and only equal values in all sorting keys are deduped.  
-- +goose Up
CREATE TABLE observations
(
    `id` String,
    `trace_id` Nullable(String),
    `project_id` String,
    `type` Nullable(String),
    `parent_observation_id` Nullable(String),
    `created_at` DateTime64,

    `start_time` Nullable(DateTime64),
    `end_time` Nullable(DateTime64),

    `name` Nullable(String),
    `metadata` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `user_id` Nullable(String),
    `level` Nullable(String),
    `status_message` Nullable(String),
    `version` Nullable(String),


    
    `input`  Nullable(String),
    `output`  Nullable(String),
    

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
    `completion_start_time` Nullable(DateTime64),
    `prompt_id` Nullable(String)
)
ENGINE = ReplacingMergeTree(created_at)
PRIMARY KEY (project_id, toDate(created_at))
ORDER BY (project_id, toDate(created_at), id);

-- +goose Down
DROP TABLE observations;
