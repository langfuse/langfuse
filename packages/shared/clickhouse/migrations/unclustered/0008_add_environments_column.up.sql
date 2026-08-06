ALTER TABLE traces ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id SETTINGS alter_sync = 2;
ALTER TABLE observations ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id SETTINGS alter_sync = 2;
ALTER TABLE scores ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id SETTINGS alter_sync = 2;