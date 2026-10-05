ALTER TABLE scores {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_project_dataset_run SETTINGS mutations_sync = 2;
