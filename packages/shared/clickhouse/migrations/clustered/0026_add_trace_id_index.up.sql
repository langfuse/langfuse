ALTER TABLE dataset_run_items_rmt ON CLUSTER default ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1;
ALTER TABLE dataset_run_items_rmt ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_trace_id;
