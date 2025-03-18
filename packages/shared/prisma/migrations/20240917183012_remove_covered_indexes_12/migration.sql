-- DropIndex
-- Removes indexes that are covered by other indexes on the same table, e.g. (project_id) if (project_id, timestamp) exists.
DROP INDEX CONCURRENTLY IF EXISTS "organization_memberships_org_id_idx"; -- covered by organization_memberships_org_id_user_id_key (unique)
