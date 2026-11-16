-- Lists user memberships whose role assignments would authorize differently from the membership role.
-- Read-only. Run with: psql "$DATABASE_URL" -f packages/shared/scripts/role-assignment-drift.sql
-- An empty result means role assignments and memberships agree.
--
-- drift:
--   role_mismatch       a permanent assignment on the membership's owner names another role
--   missing_assignment  no permanent assignment on the owner, and the user holds a live assignment, so the read path will not backfill one
--   orphan_assignment   a permanent assignment on an org or project the user has no membership in
WITH memberships AS (
  SELECT
    om.user_id,
    om.org_id,
    NULL::text AS project_id,
    'organization/' || om.org_id AS owner_id,
    om.role::text AS role
  FROM organization_memberships om
  UNION ALL
  SELECT
    pm.user_id,
    p.org_id,
    pm.project_id,
    'project/' || pm.project_id AS owner_id,
    pm.role::text AS role
  FROM project_memberships pm
  JOIN projects p ON p.id = pm.project_id
),
permanent AS (
  SELECT principal_id, user_id, org_id, project_id, owner_id, role_id
  FROM role_assignments
  WHERE principal_id LIKE 'user/%' AND expires_at IS NULL
),
live_principals AS (
  SELECT DISTINCT principal_id
  FROM role_assignments
  WHERE principal_id LIKE 'user/%'
    AND (expires_at IS NULL OR expires_at > now())
)
SELECT
  'role_mismatch' AS drift,
  m.user_id,
  m.org_id,
  m.project_id,
  m.role AS membership_role,
  ra.role_id AS assignment_role
FROM memberships m
JOIN permanent ra
  ON ra.principal_id = 'user/' || m.user_id AND ra.owner_id = m.owner_id
WHERE ra.role_id <> 'system/' || m.role

UNION ALL

SELECT
  'missing_assignment',
  m.user_id,
  m.org_id,
  m.project_id,
  m.role,
  NULL
FROM memberships m
JOIN live_principals lp ON lp.principal_id = 'user/' || m.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM permanent ra
  WHERE ra.principal_id = 'user/' || m.user_id AND ra.owner_id = m.owner_id
)

UNION ALL

SELECT
  'orphan_assignment',
  ra.user_id,
  ra.org_id,
  ra.project_id,
  NULL,
  ra.role_id
FROM permanent ra
WHERE NOT EXISTS (
  SELECT 1 FROM memberships m
  WHERE 'user/' || m.user_id = ra.principal_id AND m.owner_id = ra.owner_id
)

ORDER BY drift, org_id, user_id, project_id;
