-- Create a partial index optimized for the eval deduplication query:
-- SELECT id FROM job_executions
--  WHERE project_id = $1
--    AND job_configuration_id = $2
--    AND job_input_trace_id = $3
--    AND job_input_dataset_item_id IS NULL
--    AND job_input_observation_id IS NULL;
--
-- This index keeps the existing general-purpose indexes intact and adds
-- a highly selective one that Postgres can use instead of scanning
-- millions of rows per (project, config, trace) when dataset/observation
-- inputs are null.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "job_executions_trace_dedupe_idx"
ON "job_executions" (
  "project_id",
  "job_configuration_id",
  "job_input_trace_id"
)
WHERE "job_input_dataset_item_id" IS NULL
  AND "job_input_observation_id" IS NULL;


