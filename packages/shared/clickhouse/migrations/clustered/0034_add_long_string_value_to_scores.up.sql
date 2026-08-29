ALTER TABLE scores ON CLUSTER default ADD COLUMN IF NOT EXISTS long_string_value String CODEC(ZSTD(3)) SETTINGS alter_sync = 2;
