import { prisma, Prisma, Role } from "../../db";
import type { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { usersTableCols } from "../../tableDefinitions/usersTable";
import { hasProjectAccessByRole } from "../../features/rbac/projectAccessRights";

export {
  resolveOrganizationScopes,
  resolveProjectRole,
  resolveProjectScopes,
  type GroupRoleGrant,
} from "../../features/rbac/effectiveAccess";

/** rolesWithProjectReadByRank lists the roles that can read a project, lowest first. */
const rolesWithProjectReadByRank = [
  "VIEWER",
  "MEMBER",
  "ADMIN",
  "OWNER",
].filter((role) =>
  hasProjectAccessByRole({ role: role as Role, scope: "project:read" }),
);

/**
 * Generates a SQL query for the users who can read a project, each with their effective role there.
 *
 * A user's direct project role replaces their direct org role, up or down. Each group they belong to then adds its
 * org-wide role and its role on the project; groups never lower access. The effective role is the highest of these,
 * and users whose effective role cannot read the project are left out.
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
  const rolesByRank = Prisma.sql`ARRAY[${Prisma.join(rolesWithProjectReadByRank)}]::text[]`;
  const sqlFilter = filterCondition
    ? tableColumnsToSqlFilterAndPrefix(filterCondition, usersTableCols, "users")
    : Prisma.empty;

  return Prisma.sql`
    WITH direct_roles AS (
      -- A user's project role replaces their org role.
      SELECT DISTINCT ON (ra.user_id) ra.user_id, ra.system_role::text AS role
      FROM role_assignments ra
      WHERE ra.org_id = ${orgId}
        AND ra.user_id IS NOT NULL
        AND (ra.project_id IS NULL OR ra.project_id = ${projectId})
      ORDER BY ra.user_id, ra.project_id NULLS LAST
    ),
    candidate_roles AS (
      SELECT user_id, role FROM direct_roles
      UNION ALL
      SELECT om.user_id, ra.system_role::text AS role
      FROM organization_memberships om
      INNER JOIN group_memberships gm ON gm.org_membership_id = om.id
      INNER JOIN role_assignments ra ON ra.group_id = gm.group_id
      WHERE om.org_id = ${orgId}
        AND ra.org_id = ${orgId}
        AND (ra.project_id IS NULL OR ra.project_id = ${projectId})
        AND (ra.expires_at IS NULL OR ra.expires_at > now())
    ),
    all_eligible_users AS (
      SELECT
        u.id,
        u.name,
        u.email,
        (array_agg(cr.role ORDER BY array_position(${rolesByRank}, cr.role) DESC))[1]::"Role" AS role
      FROM candidate_roles cr
      INNER JOIN users u ON cr.user_id = u.id
      WHERE cr.role = ANY(${rolesByRank})
      ${sqlFilter}
      ${searchFilter}
      GROUP BY u.id, u.name, u.email
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
