-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "job_configurations_project_id_idx"; -- covered by job_configurations_project_id_id_idx
