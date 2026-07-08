ALTER TABLE scores ON CLUSTER default DROP INDEX IF EXISTS idx_project_dataset_run SETTINGS mutations_sync = 2;
