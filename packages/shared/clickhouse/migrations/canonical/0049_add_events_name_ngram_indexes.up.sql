-- Indexes new parts only. Do not MATERIALIZE INDEX here: rewriting existing
-- parts is a full-table mutation. Unindexed historical parts stay correct
-- and age out with monthly partitions.
--
-- Every leading-wildcard disjunct in the events search OR needs a skip index,
-- or ClickHouse discards the input/output text indexes for the whole query.
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_name lower(name) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_trace_name lower(trace_name) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_span_id lower(span_id) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_trace_id lower(trace_id) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_user_id lower(user_id) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_ngram_session_id lower(session_id) TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1 SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
