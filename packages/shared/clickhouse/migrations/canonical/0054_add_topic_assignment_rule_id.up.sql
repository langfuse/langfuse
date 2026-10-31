-- Rule-scoped Topics maps: online and refit assignments carry the rule they belong to,
-- one-off analysis assignments keep an empty rule_id. The skip index is added without
-- materializing historical parts to keep this migration metadata-only.
ALTER TABLE topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE}
  ADD COLUMN IF NOT EXISTS rule_id String DEFAULT '' AFTER clustering_run_id
 {CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
ALTER TABLE topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE}
  ADD INDEX IF NOT EXISTS idx_rule_id rule_id TYPE bloom_filter(0.001) GRANULARITY 1
 {CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
