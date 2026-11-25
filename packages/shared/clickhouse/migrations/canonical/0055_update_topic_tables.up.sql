-- Store summary embeddings as BFloat16, halving their size. Cosine distance on normalized vectors is unaffected.
ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN embedding Array(BFloat16) SETTINGS mutations_sync = 2{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
-- Point lookups by trace_id (trace views, API, agent) otherwise scan every granule in the time window. The table is small, so existing parts are materialized.
ALTER TABLE topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE} ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1{CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
ALTER TABLE topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE} MATERIALIZE INDEX IF EXISTS idx_trace_id{CLICKHOUSE_CLUSTERED_ONLY: SETTINGS mutations_sync = 2};
