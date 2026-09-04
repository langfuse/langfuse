ALTER TABLE scores {CLICKHOUSE_CLUSTER_CLAUSE}
  RESET SETTING enable_block_number_column, enable_block_offset_column{CLICKHOUSE_CLUSTERED_ONLY:
  SETTINGS alter_sync = 2};
ALTER TABLE dataset_run_items_rmt {CLICKHOUSE_CLUSTER_CLAUSE}
  RESET SETTING enable_block_number_column, enable_block_offset_column{CLICKHOUSE_CLUSTERED_ONLY:
  SETTINGS alter_sync = 2};
