CREATE MATERIALIZED VIEW observation_stats_mv ON CLUSTER default TO observation_stats AS
SELECT
    trace_id,
    project_id,
    uniqState(id) as count,
    minSimpleState(start_time) as min_start_time,
    maxSimpleState(start_time) as max_start_time,
    maxSimpleState(end_time) as max_end_time,
    sumMapSimpleState(usage_details) as sum_usage_details,
    sumMapSimpleState(cost_details) as sum_cost_details,
    sumSimpleState(total_cost) as sum_total_cost,
    groupUniqArrayArraySimpleState([level]) as unique_levels
FROM observations
GROUP BY trace_id, project_id;