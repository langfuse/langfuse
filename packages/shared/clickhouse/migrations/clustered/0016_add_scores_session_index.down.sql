ALTER TABLE scores ON CLUSTER default DROP INDEX IF EXISTS idx_project_session SETTINGS mutations_sync = 2;
