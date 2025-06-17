-- New: Query exp_traces_amt for aggregated trace data
SELECT
  id,
  name,
  start_time as timestamp,
  end_time,
  user_id,
  session_id,
  environment,
  tags,
  metadata,
  input,
  output,
  bookmarked,
  public,
  release,
  version,
  total_cost,
  latency_seconds,
  observation_count,
  created_at,
  updated_at
FROM exp_traces_amt
WHERE id = {traceId: String} 
  AND project_id = {projectId: String}
  AND start_time >= {fromTimestamp: DateTime64(3)}
  AND start_time <= {toTimestamp: DateTime64(3)}
LIMIT 1
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.byId", "schema": "new", "pattern": "single_trace_lookup"}'
