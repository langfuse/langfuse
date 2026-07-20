ALTER TABLE observations ON CLUSTER default ADD INDEX IF NOT EXISTS idx_created_at created_at TYPE minmax GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_created_at SETTINGS mutations_sync = 2;
ALTER TABLE traces ON CLUSTER default ADD INDEX IF NOT EXISTS idx_created_at created_at TYPE minmax GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE traces ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_created_at SETTINGS mutations_sync = 2;
ALTER TABLE scores ON CLUSTER default ADD INDEX IF NOT EXISTS idx_created_at created_at TYPE minmax GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE scores ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_created_at SETTINGS mutations_sync = 2;
