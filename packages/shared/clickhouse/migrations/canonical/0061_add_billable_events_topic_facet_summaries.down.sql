-- Stops billing Topics facet summaries but keeps their rows in billable_events:
-- they are billing history. The view filters on the skip states, so it goes first.
DROP VIEW IF EXISTS billable_events_topic_facet_summaries_mv {CLICKHOUSE_CLUSTER_CLAUSE};

-- Fails while any row still holds empty_input or input_too_large.
ALTER TABLE topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} MODIFY COLUMN processing_state Enum8('not_applicable' = 1, 'insufficient_input' = 2, 'complete' = 3){CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
