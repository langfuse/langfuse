ALTER TABLE scores ON CLUSTER '{cluster}' ADD COLUMN IF NOT EXISTS execution_trace_id Nullable(String);
