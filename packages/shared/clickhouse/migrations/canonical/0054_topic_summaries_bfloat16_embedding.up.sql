ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN embedding Array(BFloat16) SETTINGS mutations_sync = 2{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
