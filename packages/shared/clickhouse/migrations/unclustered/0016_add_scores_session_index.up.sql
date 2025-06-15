ALTER TABLE scores ADD INDEX IF NOT EXISTS idx_project_session (project_id, session_id) TYPE bloom_filter(0.001) GRANULARITY 1 SETTINGS mutations_sync = 2;
ALTER TABLE scores MATERIALIZE INDEX IF EXISTS idx_project_session SETTINGS mutations_sync = 2;
