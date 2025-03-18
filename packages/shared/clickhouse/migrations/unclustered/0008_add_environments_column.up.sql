ALTER TABLE traces ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id;
ALTER TABLE observations ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id;
ALTER TABLE scores ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id;