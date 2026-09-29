ALTER TABLE scores {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN trace_id Nullable(String) SETTINGS mutations_sync = 2;
