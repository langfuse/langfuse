-- Add user_id column to observations table
ALTER TABLE observations ADD COLUMN IF NOT EXISTS `user_id` Nullable(String);

-- Add user_id column to scores table
ALTER TABLE scores ADD COLUMN IF NOT EXISTS `user_id` Nullable(String);

-- Add user_id column to dataset_run_items table
ALTER TABLE dataset_run_items ADD COLUMN IF NOT EXISTS `user_id` Nullable(String);

-- Add indexes for the new user_id columns
ALTER TABLE observations ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE scores ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE dataset_run_items ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;

-- Materialize the indexes
ALTER TABLE observations MATERIALIZE INDEX IF EXISTS idx_user_id;
ALTER TABLE scores MATERIALIZE INDEX IF EXISTS idx_user_id;
ALTER TABLE dataset_run_items MATERIALIZE INDEX IF EXISTS idx_user_id;