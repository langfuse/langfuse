ALTER TABLE scores ON CLUSTER default DROP COLUMN IF EXISTS dataset_run_id SETTINGS mutations_sync = 2;
