-- Drop indexes for user_id columns
ALTER TABLE observations ON CLUSTER default DROP INDEX IF EXISTS idx_user_id;
ALTER TABLE scores ON CLUSTER default DROP INDEX IF EXISTS idx_user_id;
ALTER TABLE dataset_run_items ON CLUSTER default DROP INDEX IF EXISTS idx_user_id;

-- Drop user_id columns
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS `user_id`;
ALTER TABLE scores ON CLUSTER default DROP COLUMN IF EXISTS `user_id`;
ALTER TABLE dataset_run_items ON CLUSTER default DROP COLUMN IF EXISTS `user_id`;