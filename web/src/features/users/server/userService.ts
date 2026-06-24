import { Prisma } from "@langfuse/shared";
import {
  buildUserSearchFilter,
  getUserProjectRoles,
  getUserProjectRolesCount,
} from "@langfuse/shared/src/server";

export async function listUsersForProject({
  projectId,
  orgId,
  searchQuery,
  page,
  limit,
}: {
  projectId: string;
  orgId: string;
  searchQuery?: string;
  page: number;
  limit: number;
}) {
  const searchFilter = buildUserSearchFilter(searchQuery);

  const [users, totalCount] = await Promise.all([
    getUserProjectRoles({
      projectId,
      orgId,
      searchFilter,
      limit,
      page: page - 1,
      orderBy: Prisma.sql`ORDER BY all_eligible_users.name ASC NULLS LAST, all_eligible_users.email ASC NULLS LAST`,
    }),
    getUserProjectRolesCount({
      projectId,
      orgId,
      searchFilter,
    }),
  ]);

  return {
    data: users.map((user) => ({
      id: user.id,
      name: user.name,
    })),
    meta: {
      page,
      limit,
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}
