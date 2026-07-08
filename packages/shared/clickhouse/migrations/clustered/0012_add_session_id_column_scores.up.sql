ALTER TABLE scores ON CLUSTER default ADD COLUMN session_id Nullable(String) AFTER trace_id SETTINGS mutations_sync = 2;
