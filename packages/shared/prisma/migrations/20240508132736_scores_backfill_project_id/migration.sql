-- Backfill project_id on existing scores based on linked trace_id
UPDATE scores
SET project_id = traces.project_id
FROM traces 
WHERE scores.trace_id = traces.id;
