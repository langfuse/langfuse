ALTER TABLE dataset_run_items_rmt ON CLUSTER default ADD COLUMN IF NOT EXISTS dataset_item_version Nullable(DateTime64(3));
