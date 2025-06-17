-- Current: getObservationsForTrace()
SELECT
  id,
  trace_id,
  parent_observation_id,
  type,
  name,
  start_time,
  end_time,
  level,
  status_message,
  version,
  metadata,
  model,
  input,
  output,
  provided_model_name,
  internal_model_id,
  model_parameters,
  usage_details,
  cost_details,
  total_cost,
  completion_start_time,
  prompt_id,
  prompt_name,
  prompt_version
FROM observations FINAL
WHERE trace_id = {traceId: String}
  AND project_id = {projectId: String}
  AND start_time >= {fromTimestamp: DateTime64(3)} - INTERVAL 2 DAY
  AND start_time <= {toTimestamp: DateTime64(3)} + INTERVAL 2 DAY
ORDER BY start_time ASC
SETTINGS log_comment='{"ticket": "LFE-4969", "endpoint": "trpc.traces.byIdWithObservationsAndScores", "schema": "current", "pattern": "trace_observations_lookup"}'
