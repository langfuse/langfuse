ALTER TABLE traces ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE traces MATERIALIZE INDEX IF EXISTS idx_user_id;
