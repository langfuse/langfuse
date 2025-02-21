CREATE MATERIALIZED VIEW observation_stats_mv TO observation_stats AS
SELECT
    project_id,
    trace_id,
    uniqState(id) as count,
    minSimpleState(start_time) as min_start_time,
    maxSimpleState(start_time) as max_start_time,
    maxSimpleState(end_time) as max_end_time,
    groupUniqArrayArraySimpleState([level]) as unique_levels
FROM observations
GROUP BY project_id, trace_id;
