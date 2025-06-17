-- New: Use pre-aggregated data from exp_traces_amt
SELECT
  toStartOfHour(s.start_time) as start_time,
  s.type,
  sum(s.total_cost) as sum_total_cost,
  count(*) as count_observations
FROM exp_spans s FINAL
WHERE s.project_id = {projectId: String}
  AND s.start_time >= {fromTimestamp: DateTime64(3)}
  AND s.start_time <= {toTimestamp: DateTime64(3)}
  -- Additional filter placeholders
  AND s.model_name = {modelFilter: String})
GROUP BY 
  toStartOfHour(s.start_time),
  s.type
ORDER BY start_time ASC, type ASC
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.dashboard.chart", "schema": "new", "pattern": "cost_by_type_timeseries"}'
