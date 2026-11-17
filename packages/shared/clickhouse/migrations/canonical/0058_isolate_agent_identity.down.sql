ALTER TABLE observations {CLICKHOUSE_CLUSTER_CLAUSE}
  DROP COLUMN IF EXISTS agent_id,
  DROP COLUMN IF EXISTS agent_name,
  DROP COLUMN IF EXISTS agent_run_id,
  DROP COLUMN IF EXISTS agent_identity_source
  {CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};

ALTER TABLE observations_batch_staging {CLICKHOUSE_CLUSTER_CLAUSE}
  DROP COLUMN IF EXISTS agent_id,
  DROP COLUMN IF EXISTS agent_name,
  DROP COLUMN IF EXISTS agent_run_id,
  DROP COLUMN IF EXISTS agent_identity_source
  {CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};

ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE}
  MODIFY COLUMN agent_id String DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_id')],
  MODIFY COLUMN agent_name String DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_name')],
  MODIFY COLUMN agent_run_id String DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_run_id')],
  MODIFY COLUMN agent_identity_source LowCardinality(String) DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_identity_source')]
  SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};

ALTER TABLE events_core {CLICKHOUSE_CLUSTER_CLAUSE}
  MODIFY COLUMN agent_id String DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_id')],
  MODIFY COLUMN agent_name String DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_name')],
  MODIFY COLUMN agent_run_id String DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_run_id')],
  MODIFY COLUMN agent_identity_source LowCardinality(String) DEFAULT metadata_values[indexOf(metadata_names, 'langfuse_agent_identity_source')]
  SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
