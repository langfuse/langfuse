ALTER TABLE scores ADD COLUMN IF NOT EXISTS long_string_value String CODEC(ZSTD(3));
