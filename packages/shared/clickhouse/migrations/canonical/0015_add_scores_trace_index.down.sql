ALTER TABLE scores {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_project_trace_observation SETTINGS mutations_sync = 2;
