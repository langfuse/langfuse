ALTER TABLE traces ADD INDEX IF NOT EXISTS idx_session_id session_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE traces MATERIALIZE INDEX IF EXISTS idx_session_id;