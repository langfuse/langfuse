ALTER TABLE scores ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME} ADD COLUMN session_id Nullable(String) AFTER trace_id SETTINGS mutations_sync = 2;
