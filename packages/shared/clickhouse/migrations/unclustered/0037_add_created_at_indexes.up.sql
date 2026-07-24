ALTER TABLE observations ADD INDEX IF NOT EXISTS idx_created_at created_at TYPE minmax GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE observations MATERIALIZE INDEX IF EXISTS idx_created_at;
ALTER TABLE traces ADD INDEX IF NOT EXISTS idx_created_at created_at TYPE minmax GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE traces MATERIALIZE INDEX IF EXISTS idx_created_at;
ALTER TABLE scores ADD INDEX IF NOT EXISTS idx_created_at created_at TYPE minmax GRANULARITY 1 SETTINGS alter_sync = 2;
ALTER TABLE scores MATERIALIZE INDEX IF EXISTS idx_created_at;
