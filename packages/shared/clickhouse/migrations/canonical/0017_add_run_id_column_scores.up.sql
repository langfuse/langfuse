ALTER TABLE scores {CLICKHOUSE_CLUSTER_CLAUSE} ADD COLUMN dataset_run_id Nullable(String) AFTER session_id SETTINGS mutations_sync = 2;
