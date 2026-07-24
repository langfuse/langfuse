ALTER TABLE events_full ADD INDEX IF NOT EXISTS idx_ngram_metadata_values arrayStringConcat(metadata_values) TYPE ngrambf_v1(4, 32000, 3, 0) GRANULARITY 2 SETTINGS enable_full_text_index = 1;
ALTER TABLE events_core ADD INDEX IF NOT EXISTS idx_ngram_metadata_values arrayStringConcat(metadata_values) TYPE ngrambf_v1(4, 32000, 3, 0) GRANULARITY 2 SETTINGS enable_full_text_index = 1;
