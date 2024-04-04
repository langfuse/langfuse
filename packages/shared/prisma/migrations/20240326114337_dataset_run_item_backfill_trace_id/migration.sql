-- Backfill trace_id for existing run_items based on the linked observation
UPDATE dataset_run_items
SET trace_id = observations.trace_id
FROM observations 
WHERE dataset_run_items.observation_id = observations.id;