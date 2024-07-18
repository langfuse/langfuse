-- Migration script to update score_configs entries
-- Set categories to NULL where data_type is 'NUMERIC' and categories is an empty array

UPDATE score_configs
SET categories = NULL
WHERE data_type = 'NUMERIC' AND categories IS NOT NULL;
