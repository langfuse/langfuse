-- Lightweight updates (patch parts) require the persisted _block_number and _block_offset columns, as already set on events_full and events_core. Metadata-only: existing parts are not rewritten.
ALTER TABLE scores ON CLUSTER default
  MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1
  SETTINGS alter_sync = 2;
ALTER TABLE dataset_run_items_rmt ON CLUSTER default
  MODIFY SETTING enable_block_number_column = 1, enable_block_offset_column = 1
  SETTINGS alter_sync = 2;
