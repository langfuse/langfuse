ALTER TABLE events_full ON CLUSTER default DROP INDEX IF EXISTS idx_ngram_metadata_values SETTINGS enable_full_text_index = 1, alter_sync = 2;
ALTER TABLE events_core ON CLUSTER default DROP INDEX IF EXISTS idx_ngram_metadata_values SETTINGS enable_full_text_index = 1, alter_sync = 2;
