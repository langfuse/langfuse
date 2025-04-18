ALTER TABLE scores ADD INDEX IF NOT EXISTS idx_project_trace_observation (project_id, trace_id, observation_id) TYPE bloom_filter(0.001) GRANULARITY 1;
ALTER TABLE scores MATERIALIZE INDEX IF EXISTS idx_project_trace_observation;
