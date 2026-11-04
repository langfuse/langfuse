ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} DROP INDEX IF EXISTS idx_fts_summary_low SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
