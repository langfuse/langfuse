CREATE MATERIALIZED VIEW observation_costs_mv TO observation_costs AS
SELECT
    id,
    trace_id,
    project_id,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    level,
    created_at,
    updated_at,
    event_ts,
    is_deleted
FROM observations
