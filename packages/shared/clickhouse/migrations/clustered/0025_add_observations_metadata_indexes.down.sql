ALTER TABLE observations ON CLUSTER default DROP INDEX IF EXISTS idx_res_metadata_value;
ALTER TABLE observations ON CLUSTER default DROP INDEX IF EXISTS idx_res_metadata_key;
