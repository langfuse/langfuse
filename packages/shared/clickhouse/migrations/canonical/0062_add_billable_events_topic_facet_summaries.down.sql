-- Stops billing Topics facet summaries but keeps their rows in billable_events:
-- they are billing history.
DROP VIEW IF EXISTS billable_events_topic_facet_summaries_mv {CLICKHOUSE_CLUSTER_CLAUSE};
