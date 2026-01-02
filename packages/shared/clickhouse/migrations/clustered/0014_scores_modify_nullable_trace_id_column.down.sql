ALTER TABLE scores ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME} MODIFY COLUMN trace_id Nullable(String) SETTINGS mutations_sync = 2;
