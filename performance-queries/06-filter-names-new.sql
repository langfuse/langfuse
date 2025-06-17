SELECT
  name,
  count(*) as count
FROM exp_traces_amt
WHERE project_id = {projectId: String}
  AND start_time >= '2025-06-01'
  AND start_time <= now()
GROUP BY name
ORDER BY count DESC
LIMIT 1000
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.filterOptions", "schema": "new", "pattern": "filter_names"}'
