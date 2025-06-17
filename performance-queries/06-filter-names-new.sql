-- New: Query exp_traces_amt directly
SELECT
  name,
  count(*) as count
FROM exp_traces_amt
WHERE project_id = {projectId: String}
  AND start_time >= {fromTimestamp: DateTime64(3)}
  AND start_time <= {toTimestamp: DateTime64(3)}
GROUP BY name
ORDER BY count DESC
LIMIT 1000
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.filterOptions", "schema": "new", "pattern": "filter_names"}'
