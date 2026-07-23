ALTER TABLE events_full ADD INDEX IF NOT EXISTS idx_fts_metadata_values_ngram arrayStringConcat(metadata_values) TYPE ngrambf_v1(4, 32000, 3, 0) GRANULARITY 2 SETTINGS enable_full_text_index = 1;
ALTER TABLE events_core ADD INDEX IF NOT EXISTS idx_fts_metadata_values_ngram arrayStringConcat(metadata_values) TYPE ngrambf_v1(4, 32000, 3, 0) GRANULARITY 2 SETTINGS enable_full_text_index = 1;
