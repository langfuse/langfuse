ALTER TABLE scores ON CLUSTER default MODIFY COLUMN trace_id Nullable(String) SETTINGS mutations_sync = 2;
