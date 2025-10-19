ALTER TABLE scores ON CLUSTER default ADD COLUMN IF NOT EXISTS execution_trace_id Nullable(String);
