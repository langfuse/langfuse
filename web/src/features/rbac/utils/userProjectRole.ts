import { Prisma } from "@langfuse/shared";

export function resolveProjectRole({
  projectId,
  orgMembership,
}: {
  projectId: string;
  orgMembership: any;
}) {
  return (
    orgMembership.ProjectMemberships.find(
      (membership: any) => membership.projectId === projectId,
    )?.role ?? orgMembership.role
  );
}

/**
 * Generates a SQL query to fetch users with their project roles, respecting role hierarchy.
 *
 * ROLE HIERARCHY (from highest to lowest permissions):
 * 1. OWNER - Full org and project access
 * 2. ADMIN - Project admin access
 * 3. MEMBER - Project member access
 * 4. VIEWER - Read-only project access
 * 5. NONE - No access (excluded from results)
 *
 * PRIORITY SYSTEM:
 * - Priority 1: Organization members without specific project roles (inherit org role)
 * - Priority 2: Users with explicit project roles (overrides org role)
 *
 * ROLE RESOLUTION:
 * - If user has explicit project role: use project role
 * - If user has no project role: inherit organization role
 * - Users with NONE role at either level are excluded
 *
 * @param params Query parameters
 * @returns Prisma SQL query for user project roles
 */
export function generateUserProjectRolesQuery({
  select,
  projectId,
  orgId,
  searchFilter = Prisma.empty,
  excludeUserIds,
  limit,
  page,
  orderBy,
  userId,
}: {
  select: Prisma.Sql;
  projectId: string;
  orgId: string;
  searchFilter: Prisma.Sql;
  excludeUserIds?: string[];
  limit?: number;
  page?: number;
  orderBy: Prisma.Sql;
  userId?: string;
}) {
  const userIdFilter = userId ? Prisma.sql`AND u.id = ${userId}` : Prisma.empty;
  const excludeUserIdsFilter =
    excludeUserIds && excludeUserIds.length > 0
      ? Prisma.sql`AND u.id NOT IN (${Prisma.join(
          excludeUserIds.map((id) => Prisma.sql`${id}`),
          ", ",
        )})`
      : Prisma.empty;

  return Prisma.sql`
    WITH all_eligible_users AS (
      SELECT DISTINCT u.id, u.name, u.email, 1 as priority
      FROM organization_memberships om
      INNER JOIN users u ON om.user_id = u.id
      WHERE om.org_id = ${orgId}
        AND om.role != 'NONE'
        AND NOT EXISTS (
          SELECT 1 FROM project_memberships pm 
          WHERE pm.org_membership_id = om.id
        )
      ${userIdFilter}
      ${excludeUserIdsFilter}
      ${searchFilter}
      UNION
      SELECT DISTINCT u.id, u.name, u.email, 2 as priority
      FROM organization_memberships om
      INNER JOIN project_memberships pm ON om.id = pm.org_membership_id
      INNER JOIN users u ON om.user_id = u.id
      WHERE om.org_id = ${orgId}
        AND pm.project_id = ${projectId}
        AND pm.role != 'NONE'
      ${userIdFilter}
      ${excludeUserIdsFilter}
      ${searchFilter}
    )
    SELECT ${select}
    FROM all_eligible_users
    ${orderBy}
    ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
    ${page && limit ? Prisma.sql`OFFSET ${page * limit}` : Prisma.empty}
  `;
}
