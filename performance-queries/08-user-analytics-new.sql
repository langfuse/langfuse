WITH stats as (
  SELECT
    t.user_id as user_id,
    anyLast(t.environment) as environment,
    sum(t.count_observations) as obs_count,
    sumMap(t.usage_details) as sum_usage_details,
    max(t.start_time) as max_timestamp,
    min(t.start_time) as min_timestamp,
    uniq(t.id) as trace_count
  FROM exp_traces_amt t FINAL
  WHERE
    t.project_id = {projectId: String}
    AND t.start_time >= '2025-06-01'
    AND t.start_time <= now()
    -- Optional timestamp filter for spans (matching original logic)
  GROUP BY t.user_id
)
SELECT
  arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sum_usage_details))) as input_usage,
  arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sum_usage_details))) as output_usage,
  sum_usage_details['total'] as total_usage,
  obs_count,
  trace_count,
  user_id,
  environment,
  max_timestamp,
  min_timestamp
FROM
  stats
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "getUserMetrics", "schema": "new", "pattern": "user_analytics_simple"}'
