ALTER TABLE scores ADD INDEX IF NOT EXISTS idx_project_dataset_run (project_id, dataset_run_id) TYPE bloom_filter(0.001) GRANULARITY 1 SETTINGS mutations_sync = 2;
ALTER TABLE scores MATERIALIZE INDEX IF EXISTS idx_project_dataset_run SETTINGS mutations_sync = 2;
