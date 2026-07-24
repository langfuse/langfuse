ALTER TABLE observations ON CLUSTER default DROP INDEX IF EXISTS idx_created_at;
ALTER TABLE traces ON CLUSTER default DROP INDEX IF EXISTS idx_created_at;
ALTER TABLE scores ON CLUSTER default DROP INDEX IF EXISTS idx_created_at;
