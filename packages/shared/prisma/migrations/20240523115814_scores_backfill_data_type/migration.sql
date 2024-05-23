-- Backfill data_type on existing scores as 'NUMERIC'
UPDATE scores
SET data_type = 'NUMERIC'
WHERE data_type IS NULL;
