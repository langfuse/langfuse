-- Current: getTraceById() - Simple lookup
SELECT *
FROM traces
WHERE id = {traceId: String} 
  AND project_id = {projectId: String}
  AND timestamp >= {fromTimestamp: DateTime64(3)}
  AND timestamp <= {toTimestamp: DateTime64(3)}
LIMIT 1
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.byId", "schema": "current", "pattern": "single_trace_lookup"}'
