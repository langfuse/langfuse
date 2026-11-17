ALTER TABLE observations {CLICKHOUSE_CLUSTER_CLAUSE}
  ADD COLUMN IF NOT EXISTS agent_id String DEFAULT '',
  ADD COLUMN IF NOT EXISTS agent_name String DEFAULT '',
  ADD COLUMN IF NOT EXISTS agent_run_id String DEFAULT '',
  ADD COLUMN IF NOT EXISTS agent_identity_source LowCardinality(String) DEFAULT ''
  {CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};

ALTER TABLE observations_batch_staging {CLICKHOUSE_CLUSTER_CLAUSE}
  ADD COLUMN IF NOT EXISTS agent_id String DEFAULT '',
  ADD COLUMN IF NOT EXISTS agent_name String DEFAULT '',
  ADD COLUMN IF NOT EXISTS agent_run_id String DEFAULT '',
  ADD COLUMN IF NOT EXISTS agent_identity_source LowCardinality(String) DEFAULT ''
  {CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};

ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE}
  MODIFY COLUMN agent_id String DEFAULT '',
  MODIFY COLUMN agent_name String DEFAULT '',
  MODIFY COLUMN agent_run_id String DEFAULT '',
  MODIFY COLUMN agent_identity_source LowCardinality(String) DEFAULT ''
  SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};

ALTER TABLE events_core {CLICKHOUSE_CLUSTER_CLAUSE}
  MODIFY COLUMN agent_id String DEFAULT '',
  MODIFY COLUMN agent_name String DEFAULT '',
  MODIFY COLUMN agent_run_id String DEFAULT '',
  MODIFY COLUMN agent_identity_source LowCardinality(String) DEFAULT ''
  SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
