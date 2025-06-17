SELECT
  name,
  count(*) as count
FROM traces t
WHERE t.project_id = {projectId: String}
  AND t.timestamp >= '2025-06-01'
  AND t.timestamp <= now()
GROUP BY name
ORDER BY count DESC
LIMIT 1000
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.filterOptions", "schema": "current", "pattern": "filter_names"}'
