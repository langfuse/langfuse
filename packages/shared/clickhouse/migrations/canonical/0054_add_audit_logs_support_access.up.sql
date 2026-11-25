-- Marks events of users who acted through a ConductorOne support access grant
-- instead of an organization membership. Customer-facing reads leave these
-- rows out by default.
ALTER TABLE audit_logs {CLICKHOUSE_CLUSTER_CLAUSE} ADD COLUMN IF NOT EXISTS support_access Bool DEFAULT false AFTER user_project_role{CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
