ALTER TABLE events_full DROP INDEX IF EXISTS idx_ngram_metadata_values SETTINGS enable_full_text_index = 1;
ALTER TABLE events_core DROP INDEX IF EXISTS idx_ngram_metadata_values SETTINGS enable_full_text_index = 1;
