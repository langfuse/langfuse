ALTER TABLE observations ON CLUSTER default DROP INDEX IF EXISTS idx_res_metadata_value SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default DROP INDEX IF EXISTS idx_res_metadata_key SETTINGS alter_sync = 2;
