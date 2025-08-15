ALTER TABLE observations ADD INDEX IF NOT EXISTS idx_res_metadata_key mapKeys(metadata) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE observations ADD INDEX IF NOT EXISTS idx_res_metadata_value mapValues(metadata) TYPE bloom_filter(0.01) GRANULARITY 1;
ALTER TABLE observations MATERIALIZE INDEX IF EXISTS idx_res_metadata_key;
ALTER TABLE observations MATERIALIZE INDEX IF EXISTS idx_res_metadata_value;
