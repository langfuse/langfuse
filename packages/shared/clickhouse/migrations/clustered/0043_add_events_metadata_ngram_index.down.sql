ALTER TABLE events_full ON CLUSTER default DROP INDEX IF EXISTS idx_fts_metadata_values_ngram SETTINGS enable_full_text_index = 1, alter_sync = 2;
ALTER TABLE events_core ON CLUSTER default DROP INDEX IF EXISTS idx_fts_metadata_values_ngram SETTINGS enable_full_text_index = 1, alter_sync = 2;
