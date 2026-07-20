ALTER TABLE observations DROP INDEX IF EXISTS idx_created_at;
ALTER TABLE traces DROP INDEX IF EXISTS idx_created_at;
ALTER TABLE scores DROP INDEX IF EXISTS idx_created_at;
