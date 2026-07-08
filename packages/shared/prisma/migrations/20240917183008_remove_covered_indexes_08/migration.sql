-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "models_project_id_model_name_start_date_unit_idx"; -- covered by models_project_id_model_name_start_date_unit_key (unique)
