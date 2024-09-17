-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "traces_project_id_idx"; -- covered by traces_project_id_timestamp_idx
DROP INDEX CONCURRENTLY IF EXISTS "datasets_project_id_idx"; -- covered by datasets_project_id_name_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "eval_templates_project_id_idx"; -- covered by eval_templates_project_id_id_idx
DROP INDEX CONCURRENTLY IF EXISTS "job_configurations_project_id_idx"; -- covered by job_configurations_project_id_id_idx
DROP INDEX CONCURRENTLY IF EXISTS "job_executions_project_id_idx"; -- covered by job_executions_project_id_id_idx
DROP INDEX CONCURRENTLY IF EXISTS "llm_api_keys_project_id_provider_idx"; -- covered by llm_api_keys_project_id_provider_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "models_project_id_model_name_idx"; -- covered by models_project_id_model_name_start_date_unit_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "models_project_id_model_name_start_date_unit_idx"; -- covered by models_project_id_model_name_start_date_unit_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "observations_project_id_idx"; -- covered by observations_project_id_start_time_type_idx
DROP INDEX CONCURRENTLY IF EXISTS "observations_trace_id_idx"; -- covered by observations_trace_id_project_id_start_time_idx
DROP INDEX CONCURRENTLY IF EXISTS "observations_traces_id_project_id_idx"; -- covered by observations_trace_id_project_id_start_time_idx
DROP INDEX CONCURRENTLY IF EXISTS "organization_memberships_org_id_idx"; -- covered by organization_memberships_org_id_user_id_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "posthog_integrations_project_id_idx"; -- covered by posthog_integrations_pkey (unique)
DROP INDEX CONCURRENTLY IF EXISTS "prompts_project_id_idx"; -- covered by prompts_project_id_name_version_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "prompts_project_id_name_version_idx"; -- covered by prompts_project_id_name_version_key (unique)
DROP INDEX CONCURRENTLY IF EXISTS "scores_project_id_idx"; -- covered by scores_project_id_name_idx
