ALTER TABLE scores ON CLUSTER default DROP COLUMN IF EXISTS session_id SETTINGS mutations_sync = 2;
