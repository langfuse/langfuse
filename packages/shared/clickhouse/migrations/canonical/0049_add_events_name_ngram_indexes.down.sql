ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_ngram_name SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_ngram_trace_name SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_ngram_user_id SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_ngram_session_id SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
