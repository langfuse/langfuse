-- Current: getObservationCostByTypeByTime() - Complex aggregation
SELECT
  toStartOfHour(start_time) as start_time,
  type,
  sum(total_cost) as sum_total_cost,
  count(*) as count_observations
FROM observations FINAL
WHERE project_id = {projectId: String}
  AND start_time >= {fromTimestamp: DateTime64(3)}
  AND start_time <= {toTimestamp: DateTime64(3)}
  -- Additional filter placeholders
  AND provided_model_name = {modelFilter: String})
GROUP BY 
  toStartOfHour(start_time),
  type
ORDER BY start_time ASC, type ASC
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.dashboard.chart", "schema": "current", "pattern": "cost_by_type_timeseries"}'
