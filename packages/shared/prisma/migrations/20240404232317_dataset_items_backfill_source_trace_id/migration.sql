-- Backfill source_trace_id for existing dataset_items based on the linked source_observation_id
UPDATE dataset_items
SET source_trace_id = observations.trace_id
FROM observations
WHERE dataset_items.source_observation_id = observations.id
  AND dataset_items.source_observation_id IS NOT NULL
  AND dataset_items.source_trace_id IS NULL