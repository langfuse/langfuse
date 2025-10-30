import { prisma, Prisma, Role, ProjectMembership } from "../../db";
import type { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { usersTableCols } from "../../tableDefinitions/usersTable";

export function resolveProjectRole({
  projectId,
  projectMemberships,
  orgMembershipRole,
}: {
  projectId: string;
  projectMemberships: ProjectMembership[];
  orgMembershipRole: Role;
}): Role {
  return (
    projectMemberships.find((membership) => membership.projectId === projectId)
      ?.role ?? orgMembershipRole
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
function generateUserProjectRolesQuery({
  select,
  projectId,
  orgId,
  searchFilter = Prisma.empty,
  filterCondition,
  limit,
  page,
  orderBy,
}: {
  select: Prisma.Sql;
  projectId: string;
  orgId: string;
  filterCondition: FilterState;
  searchFilter: Prisma.Sql;
  limit?: number;
  page?: number;
  orderBy: Prisma.Sql;
}) {
  const sqlFilter = filterCondition
    ? tableColumnsToSqlFilterAndPrefix(filterCondition, usersTableCols, "users")
    : Prisma.empty;

  return Prisma.sql`
    WITH all_eligible_users AS (
      SELECT u.id, u.name, u.email, om.role as role
      FROM organization_memberships om
      INNER JOIN users u ON om.user_id = u.id
      WHERE om.org_id = ${orgId}
        AND om.role != 'NONE'
        AND NOT EXISTS (
          SELECT 1 FROM project_memberships pm 
          WHERE pm.org_membership_id = om.id
        )
      ${sqlFilter}
      ${searchFilter}
      UNION
      SELECT u.id, u.name, u.email, pm.role as role
      FROM organization_memberships om
      INNER JOIN project_memberships pm ON om.id = pm.org_membership_id
      INNER JOIN users u ON om.user_id = u.id
      WHERE om.org_id = ${orgId}
        AND pm.project_id = ${projectId}
        AND pm.role != 'NONE'
      ${sqlFilter}
      ${searchFilter}
    )
    SELECT ${select}
    FROM all_eligible_users
    ${orderBy}
    ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
    ${page && limit ? Prisma.sql`OFFSET ${page * limit}` : Prisma.empty}
  `;
}

export const getUserProjectRoles = async ({
  projectId,
  orgId,
  searchFilter = Prisma.empty,
  filterCondition,
  limit,
  page,
  orderBy,
}: {
  projectId: string;
  orgId: string;
  filterCondition: FilterState;
  searchFilter: Prisma.Sql;
  limit?: number;
  page?: number;
  orderBy: Prisma.Sql;
}) => {
  return await prisma.$queryRaw<
    Array<{ id: string; name: string; email: string; role: Role }>
  >(
    generateUserProjectRolesQuery({
      select: Prisma.sql`all_eligible_users.id, all_eligible_users.name, all_eligible_users.email, all_eligible_users.role`,
      projectId,
      orgId,
      filterCondition,
      searchFilter,
      limit,
      page,
      orderBy,
    }),
  );
};

export const getUserProjectRolesCount = async ({
  projectId,
  orgId,
  searchFilter = Prisma.empty,
  filterCondition,
}: {
  projectId: string;
  orgId: string;
  filterCondition: FilterState;
  searchFilter: Prisma.Sql;
}) => {
  const count = await prisma.$queryRaw<Array<{ count: bigint }>>(
    generateUserProjectRolesQuery({
      select: Prisma.sql`COUNT(*) AS count`,
      projectId,
      orgId,
      filterCondition,
      searchFilter,
      limit: 1,
      page: 0,
      orderBy: Prisma.empty,
    }),
  );

  return count.length > 0 ? Number(count[0]?.count) : 0;
};
