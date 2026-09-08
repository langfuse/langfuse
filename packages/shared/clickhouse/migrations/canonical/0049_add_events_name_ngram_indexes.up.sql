-- Indexes new parts only. Do not MATERIALIZE INDEX here: rewriting existing
-- parts is a full-table mutation. Unindexed historical parts stay correct
-- and age out with monthly partitions.
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_name lower(name) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_trace_name lower(trace_name) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
