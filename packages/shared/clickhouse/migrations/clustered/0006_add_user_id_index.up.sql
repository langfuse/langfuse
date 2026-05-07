ALTER TABLE traces ON CLUSTER default ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE traces ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_user_id SETTINGS mutations_sync = 2;
