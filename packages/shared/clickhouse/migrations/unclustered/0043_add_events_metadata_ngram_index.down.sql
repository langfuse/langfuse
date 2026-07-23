ALTER TABLE events_full DROP INDEX IF EXISTS idx_fts_metadata_values_ngram SETTINGS enable_full_text_index = 1;
ALTER TABLE events_core DROP INDEX IF EXISTS idx_fts_metadata_values_ngram SETTINGS enable_full_text_index = 1;
