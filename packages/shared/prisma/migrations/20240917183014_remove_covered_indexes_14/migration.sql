-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "prompts_project_id_idx"; -- covered by prompts_project_id_name_version_key (unique)
