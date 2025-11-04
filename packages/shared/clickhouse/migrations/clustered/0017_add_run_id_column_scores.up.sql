ALTER TABLE scores ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME} ADD COLUMN dataset_run_id Nullable(String) AFTER session_id SETTINGS mutations_sync = 2;
