SELECT
  id,
  name,
  start_time as timestamp,
  end_time,
  user_id,
  session_id,
  environment,
  tags,
  input,
  output
FROM exp_traces_amt
WHERE id = {traceId: String} 
  AND project_id = {projectId: String}
LIMIT 1
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.byId", "schema": "new", "pattern": "single_trace_lookup"}'
