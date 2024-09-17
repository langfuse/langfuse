-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "llm_api_keys_project_id_provider_idx"; -- covered by llm_api_keys_project_id_provider_key (unique)
