-- Add user_id column to observations table
ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS `user_id` Nullable(String);

-- Add user_id column to scores table
ALTER TABLE scores ON CLUSTER default ADD COLUMN IF NOT EXISTS `user_id` Nullable(String);

-- Add user_id column to dataset_run_items table
ALTER TABLE dataset_run_items ON CLUSTER default ADD COLUMN IF NOT EXISTS `user_id` Nullable(String);

-- Add indexes for the new user_id columns
ALTER TABLE observations ON CLUSTER default ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE scores ON CLUSTER default ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;
ALTER TABLE dataset_run_items ON CLUSTER default ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1;

-- Materialize the indexes
ALTER TABLE observations ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_user_id;
ALTER TABLE scores ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_user_id;
ALTER TABLE dataset_run_items ON CLUSTER default MATERIALIZE INDEX IF EXISTS idx_user_id;