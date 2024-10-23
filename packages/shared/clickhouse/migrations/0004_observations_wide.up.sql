CREATE TABLE observations_wide
(
    `id` String,
    trace_id Nullable(String),
    `name` Nullable(String),
    `project_id` String,
    `user_id` Nullable(String),
    `metadata` Map(String, String),
    `release` Nullable(String),
    `version` Nullable(String),
    `public` Bool,
    `bookmarked` Bool,
    `tags` Array(String),
    `session_id` Nullable(String),
    `created_at` DateTime64(3),
    `updated_at` DateTime64(3),
    event_ts DateTime64(3),
    `type` LowCardinality(String),
    `parent_observation_id` Nullable(String),
    `start_time` DateTime64(3),
    `end_time` Nullable(DateTime64(3)),
    `level` LowCardinality(String),
    `status_message` Nullable(String),
    `provided_model_name` Nullable(String),
    `internal_model_id` Nullable(String),
    `model_parameters` Nullable(String),
    `provided_usage_details` Map(LowCardinality(String), UInt64),
    `usage_details` Map(LowCardinality(String), UInt64),
    `provided_cost_details` Map(LowCardinality(String), Decimal64(12)),
    `cost_details` Map(LowCardinality(String), Decimal64(12)),
    `total_cost` Nullable(Decimal64(12)),
    `completion_start_time` Nullable(DateTime64(3)),
    `prompt_id` Nullable(String),
    `prompt_name` Nullable(String),
    `prompt_version` Nullable(UInt16),
    trace_timestamp DateTime64(3),
    trace_name String,
    trace_user_id Nullable(String),
    trace_metadata Map(String, String),
    trace_release Nullable(String),
    trace_version Nullable(String),
    trace_public Bool,
    trace_bookmarked Bool,
    trace_tags Array(String),
    trace_session_id Nullable(String),
    trace_event_ts DateTime64(3)
) ENGINE = ReplacingMergeTree Partition by toYYYYMM(start_time)
PRIMARY KEY (
        project_id,
        `type`,
        toDate(start_time)
    )
ORDER BY (
        project_id,
        `type`,
        toDate(start_time),
        id
    );

CREATE MATERIALIZED VIEW traces_to_observations_wide TO observations_wide AS
SELECT 
    argMax(t.`name`, o.event_ts) as trace_name,
    argMax(t.timestamp, o.event_ts) as trace_timestamp,
    argMax(t.user_id, o.event_ts) as trace_user_id,
    argMax(t.metadata, o.event_ts) as trace_metadata,
    argMax(t.release, o.event_ts) as trace_release,
    argMax(t.version, o.event_ts) as trace_version,
    argMax(t.project_id, o.event_ts) as trace_project_id,
    argMax(t.public, o.event_ts) as trace_public,
    argMax(t.bookmarked, o.event_ts) as trace_bookmarked,
    argMax(t.tags, o.event_ts) as trace_tags,
    argMax(t.session_id, o.event_ts) as trace_session_id,
    argMax(t.event_ts, o.event_ts) as trace_event_ts,
    o.id as id,
    argMax(o.trace_id, o.event_ts) as trace_id,
    argMax(o.name, o.event_ts) as `name`,
    o.project_id as project_id,
    argMax(o.metadata, o.event_ts) as metadata,
    argMax(o.type, o.event_ts) as type,
    argMax(o.parent_observation_id, o.event_ts) as parent_observation_id,
    argMax(o.start_time, o.event_ts) as start_time,
    argMax(o.end_time, o.event_ts) as end_time,
    argMax(o.level, o.event_ts) as level,
    argMax(o.status_message, o.event_ts) as status_message,
    argMax(o.provided_model_name, o.event_ts) as provided_model_name,
    argMax(o.internal_model_id, o.event_ts) as internal_model_id,
    argMax(o.model_parameters, o.event_ts) as model_parameters,
    argMax(o.provided_usage_details, o.event_ts) as provided_usage_details,
    argMax(o.provided_cost_details, o.event_ts) as provided_cost_details,
    argMax(o.usage_details, o.event_ts) as usage_details,
    argMax(o.cost_details, o.event_ts) as cost_details,
    argMax(o.total_cost, o.event_ts) as total_cost,
    argMax(o.completion_start_time, o.event_ts) as completion_start_time,
    argMax(o.prompt_id, o.event_ts) as prompt_id,
    argMax(o.prompt_name, o.event_ts) as prompt_name,
    argMax(o.prompt_version, o.event_ts) as prompt_version,
    argMax(o.created_at, o.event_ts) as created_at,
    argMax(o.updated_at, o.event_ts) as updated_at,
    argMax(o.event_ts, o.event_ts) as event_ts
FROM traces t
INNER JOIN observations o ON t.id = o.trace_id
GROUP BY o.id, o.project_id
ORDER BY event_ts desc
LIMIT 1 by o.id;

CREATE MATERIALIZED VIEW observations_to_observations_wide TO observations_wide AS
SELECT 
  argMax(t.timestamp, o.event_ts) as trace_timestamp,
    argMax(t.name, o.event_ts) as trace_name,
    argMax(t.user_id, o.event_ts) as trace_user_id,
    argMax(t.metadata, o.event_ts) as trace_metadata,
    argMax(t.release, o.event_ts) as trace_release,
    argMax(t.version, o.event_ts) as trace_version,
    argMax(t.project_id, o.event_ts) as trace_project_id,
    argMax(t.public, o.event_ts) as trace_public,
    argMax(t.bookmarked, o.event_ts) as trace_bookmarked,
    argMax(t.tags, o.event_ts) as trace_tags,
    argMax(t.session_id, o.event_ts) as trace_session_id,
    argMax(t.event_ts, o.event_ts) as trace_event_ts,
    o.id as id,
    argMax(o.trace_id, o.event_ts) as trace_id,
    argMax(o.name, o.event_ts) as name,
    o.project_id as project_id,
    argMax(o.metadata, o.event_ts) as metadata,
    argMax(o.type, o.event_ts) as type,
    argMax(o.parent_observation_id, o.event_ts) as parent_observation_id,
    argMax(o.start_time, o.event_ts) as start_time,
    argMax(o.end_time, o.event_ts) as end_time,
    argMax(o.level, o.event_ts) as level,
    argMax(o.status_message, o.event_ts) as status_message,
    argMax(o.provided_model_name, o.event_ts) as provided_model_name,
    argMax(o.internal_model_id, o.event_ts) as internal_model_id,
    argMax(o.model_parameters, o.event_ts) as model_parameters,
    argMax(o.provided_usage_details, o.event_ts) as provided_usage_details,
    argMax(o.provided_cost_details, o.event_ts) as provided_cost_details,
    argMax(o.usage_details, o.event_ts) as usage_details,
    argMax(o.cost_details, o.event_ts) as cost_details,
    argMax(o.total_cost, o.event_ts) as total_cost,
    argMax(o.completion_start_time, o.event_ts) as completion_start_time,
    argMax(o.prompt_id, o.event_ts) as prompt_id,
    argMax(o.prompt_name, o.event_ts) as prompt_name,
    argMax(o.prompt_version, o.event_ts) as prompt_version,
    argMax(o.created_at, o.event_ts) as created_at,
    argMax(o.updated_at, o.event_ts) as updated_at,
    argMax(o.event_ts, o.event_ts) as event_ts
FROM observations o
LEFT OUTER JOIN traces t ON t.id = o.trace_id
GROUP BY o.id, o.project_id 
ORDER BY event_ts desc
LIMIT 1 by o.id;


