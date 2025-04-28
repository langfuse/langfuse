ALTER TABLE scores ON CLUSTER default ADD INDEX IF NOT EXISTS idx_project_trace_observation (project_id, trace_id, observation_id) TYPE bloom_filter(0.001) GRANULARITY 1 SETTINGS mutations_sync = 2;
ALTER TABLE scores ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_project_trace_observation SETTINGS mutations_sync = 2;
