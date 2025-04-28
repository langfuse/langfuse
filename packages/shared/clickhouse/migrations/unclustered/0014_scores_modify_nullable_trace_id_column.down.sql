ALTER TABLE scores MODIFY COLUMN trace_id Nullable(String) SETTINGS mutations_sync = 2;
