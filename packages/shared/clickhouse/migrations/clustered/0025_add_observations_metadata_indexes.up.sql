ALTER TABLE observations ON CLUSTER default ADD INDEX IF NOT EXISTS idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE observations ON CLUSTER default ADD INDEX IF NOT EXISTS idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE observations ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_res_metadata_key SETTINGS mutations_sync = 2;
ALTER TABLE observations ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_res_metadata_value SETTINGS mutations_sync = 2;
