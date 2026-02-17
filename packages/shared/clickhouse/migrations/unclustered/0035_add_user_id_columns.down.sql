-- Drop indexes for user_id columns
ALTER TABLE observations DROP INDEX IF EXISTS idx_user_id;
ALTER TABLE scores DROP INDEX IF EXISTS idx_user_id;
ALTER TABLE dataset_run_items DROP INDEX IF EXISTS idx_user_id;

-- Drop user_id columns
ALTER TABLE observations DROP COLUMN IF EXISTS `user_id`;
ALTER TABLE scores DROP COLUMN IF EXISTS `user_id`;
ALTER TABLE dataset_run_items DROP COLUMN IF EXISTS `user_id`;