-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "observations_trace_id_project_id_idx"; -- covered by observations_trace_id_project_id_start_time_idx
