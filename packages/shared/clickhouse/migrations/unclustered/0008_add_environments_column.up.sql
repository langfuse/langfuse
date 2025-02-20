ALTER TABLE traces ADD COLUMN environment LowCardinality(Nullable(String)) AFTER project_id;
ALTER TABLE observations ADD COLUMN environment LowCardinality(Nullable(String)) AFTER project_id;
ALTER TABLE scores ADD COLUMN environment LowCardinality(Nullable(String)) AFTER project_id;