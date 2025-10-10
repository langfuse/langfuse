ALTER TABLE scores ON CLUSTER '{cluster}' ADD COLUMN IF NOT EXISTS eval_execution_trace_id Nullable(String);
