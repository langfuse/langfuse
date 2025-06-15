ALTER TABLE scores ON CLUSTER default DROP INDEX IF EXISTS idx_project_trace_observation SETTINGS mutations_sync = 2;
