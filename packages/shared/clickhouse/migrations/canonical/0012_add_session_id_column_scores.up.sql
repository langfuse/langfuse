ALTER TABLE scores {CLICKHOUSE_CLUSTER_CLAUSE} ADD COLUMN session_id Nullable(String) AFTER trace_id SETTINGS mutations_sync = 2;
