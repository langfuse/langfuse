ALTER TABLE scores ON CLUSTER default ADD COLUMN IF NOT EXISTS long_string_value Nullable(String) CODEC(ZSTD(3));
