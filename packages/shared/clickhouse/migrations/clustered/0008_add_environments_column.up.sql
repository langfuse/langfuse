ALTER TABLE traces ON CLUSTER default ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id;
ALTER TABLE observations ON CLUSTER default ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id;
ALTER TABLE scores ON CLUSTER default ADD COLUMN environment LowCardinality(String) DEFAULT 'default' AFTER project_id;