SELECT
  toStartOfHour(s.start_time) as start_time,
  s.type,
  sum(s.total_cost) as sum_total_cost,
  count(*) as count_observations
FROM exp_spans s FINAL -- also compare without final
WHERE s.project_id = {projectId: String}
  AND s.start_time >= '2025-06-01'
  AND s.start_time <= now()
  -- Additional filter placeholders
  -- AND s.model_name = {modelFilter: String})
GROUP BY 
  start_time,
  s.type
ORDER BY start_time ASC, type ASC
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.dashboard.chart", "schema": "new", "pattern": "cost_by_type_timeseries"}'
