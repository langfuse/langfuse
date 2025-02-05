CREATE MATERIALIZED VIEW observation_stats_mv ON CLUSTER default TO observation_stats AS
SELECT
    trace_id,
    project_id,
    uniqState(id) as count,
    minSimpleState(start_time) as min_start_time,
    maxSimpleState(start_time) as max_start_time,
    maxSimpleState(end_time) as max_end_time,
    groupUniqArrayArraySimpleState([level]) as unique_levels
FROM observations
GROUP BY trace_id, project_id;
