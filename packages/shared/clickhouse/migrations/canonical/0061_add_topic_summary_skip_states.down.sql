-- Fails while any row still holds empty_input or input_too_large.
ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN processing_state Enum8('not_applicable' = 1, 'insufficient_input' = 2, 'complete' = 3){CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
