ALTER TABLE scores ON CLUSTER default DROP COLUMN IF EXISTS run_id SETTINGS mutations_sync = 2;
